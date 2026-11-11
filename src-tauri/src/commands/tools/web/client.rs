//! The HTTP client of the web tools and the rules for where it may connect: http and https only,
//! no credentials, public addresses only (checked again when the name is resolved, so DNS tricks
//! and redirects cannot reach a private network). Redirects are never followed here; callers
//! check each hop and call `send_get` for it.
use crate::commands::tools::limits::WEB_REQUEST_TIMEOUT_SECS;
use flate2::read::GzDecoder;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{ACCEPT_ENCODING, CONTENT_ENCODING, LOCATION};
use reqwest::{Client, Response, StatusCode};
use std::io::{self, Read};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use url::{Host, Url};

/// Identifies the app to the sites it reads.
pub(super) const USER_AGENT: &str = concat!(
    "LocalGenie/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/andrew-c0/LocalGenie)"
);

/// The refusal for a destination that is not on the public internet.
pub(super) const NON_PUBLIC_ADDRESS: &str = "This address is not a public web address.";

/// Start of the tool text for a site that could not be reached. The frontend matches it.
pub(super) const OFFLINE_PREFIX: &str = "Could not reach the web:";

const REDIRECT_STATUSES: [StatusCode; 5] = [
    StatusCode::MOVED_PERMANENTLY,
    StatusCode::FOUND,
    StatusCode::SEE_OTHER,
    StatusCode::TEMPORARY_REDIRECT,
    StatusCode::PERMANENT_REDIRECT,
];

/// Why a web request did not give a usable answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands::tools) enum WebError {
    /// No answer from the site: DNS, connection or timeout. The text starts with `OFFLINE_PREFIX`.
    Unreachable(String),
    /// Anything else: a refused address, an HTTP status, a body that cannot be read.
    Failed(String),
}

impl WebError {
    /// The tool-level text the model reads.
    pub(super) fn message(&self) -> String {
        match self {
            Self::Unreachable(reason) => format!("{OFFLINE_PREFIX} {reason}"),
            Self::Failed(message) => message.clone(),
        }
    }
}

impl From<WebError> for String {
    fn from(error: WebError) -> Self {
        error.message()
    }
}

/// A response body after the byte cap. `cut` is set when more bytes were there than the cap allowed.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Body {
    pub(super) bytes: Vec<u8>,
    pub(super) cut: bool,
}

/// The shared client of the web tools, built once. A failed build is an error: a client without
/// the address rules is never used as a fallback.
pub(super) fn web_client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT.get_or_init(build_client).clone()
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(WEB_REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .dns_resolver(Arc::new(PublicOnlyResolver))
        .build()
        .map_err(|error| format!("The web client could not be started: {error}"))
}

/// Resolves names for the client and keeps only public addresses.
struct PublicOnlyResolver;

impl Resolve for PublicOnlyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(resolve_public(name.as_str().to_string()))
    }
}

async fn resolve_public(host: String) -> Result<Addrs, Box<dyn std::error::Error + Send + Sync>> {
    let found: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
        .await?
        .collect();
    if found.is_empty() {
        let message = format!("No address was found for {host}");
        return Err(io::Error::new(io::ErrorKind::NotFound, message).into());
    }
    let public = public_addresses(found);
    if public.is_empty() {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, NON_PUBLIC_ADDRESS).into());
    }
    Ok(Box::new(public.into_iter()))
}

/// The addresses that are public web addresses, in their order.
pub(super) fn public_addresses(
    addresses: impl IntoIterator<Item = SocketAddr>,
) -> Vec<SocketAddr> {
    addresses
        .into_iter()
        .filter(|address| is_public_ip(address.ip()))
        .collect()
}

/// Whether an address is one a public site can have. Loopback, private, link-local (including the
/// cloud metadata address), carrier-grade NAT, unspecified, multicast and reserved ranges are not.
pub(super) fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4() {
            Some(embedded) => is_public_v4(embedded),
            None => is_public_v6(v6),
        },
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    let shared_nat = a == 100 && (b & 0xC0) == 64;
    let benchmarking = a == 198 && (b & 0xFE) == 18;
    let protocol_assignments = a == 192 && b == 0 && c == 0;
    let this_network = a == 0;
    let reserved = a >= 240;
    !(ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.is_documentation()
        || shared_nat
        || benchmarking
        || protocol_assignments
        || this_network
        || reserved)
}

fn is_public_v6(ip: std::net::Ipv6Addr) -> bool {
    let segments = ip.segments();
    let [first, second, _, _, _, _, high, low] = segments;
    // NAT64 (64:ff9b::/96) carries an IPv4 address in its last 32 bits.
    if segments[..6] == [0x0064, 0xff9b, 0, 0, 0, 0] {
        return is_public_v4(Ipv4Addr::from((u32::from(high) << 16) | u32::from(low)));
    }
    let unique_local = (first & 0xfe00) == 0xfc00;
    let link_local = (first & 0xffc0) == 0xfe80;
    let documentation = first == 0x2001 && second == 0x0db8;
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || unique_local
        || link_local
        || documentation)
}

/// Whether a URL may be requested at all: http or https, no username or password, and an IP
/// literal only when it is public. Host names are checked when they are resolved.
pub(super) fn check_destination(url: &Url) -> Result<(), String> {
    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(format!(
                "Only http and https addresses can be read, not '{other}'."
            ))
        }
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Addresses with a username or password are not allowed.".into());
    }
    match url.host() {
        None => Err("The address has no host name.".into()),
        Some(Host::Domain(_)) => Ok(()),
        Some(Host::Ipv4(ip)) => check_literal(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => check_literal(IpAddr::V6(ip)),
    }
}

fn check_literal(ip: IpAddr) -> Result<(), String> {
    if is_public_ip(ip) {
        Ok(())
    } else {
        Err(NON_PUBLIC_ADDRESS.into())
    }
}

/// One GET without following redirects. The caller checks the URL before it calls this.
pub(super) async fn send_get(client: &Client, url: Url) -> Result<Response, WebError> {
    client
        .get(url)
        .header(ACCEPT_ENCODING, "gzip")
        .send()
        .await
        .map_err(|error| classify(&error))
}

/// The next URL of a redirect response, or `None` when the response is the final one.
pub(super) fn redirect_target(
    current: &Url,
    response: &Response,
) -> Result<Option<Url>, WebError> {
    let location = response
        .headers()
        .get(LOCATION)
        .and_then(|value| value.to_str().ok());
    next_location(current, response.status(), location).map_err(WebError::Failed)
}

/// Pure form of `redirect_target`: a redirect status needs a `Location` that resolves to a URL.
pub(super) fn next_location(
    current: &Url,
    status: StatusCode,
    location: Option<&str>,
) -> Result<Option<Url>, String> {
    if !REDIRECT_STATUSES.contains(&status) {
        return Ok(None);
    }
    let Some(location) = location else {
        return Err(format!(
            "The site redirected without a new address (HTTP {}).",
            status.as_u16()
        ));
    };
    current
        .join(location.trim())
        .map(Some)
        .map_err(|_| "The redirect address is not valid.".to_string())
}

/// Turn a reqwest error into the web error the model and the frontend read.
pub(super) fn classify(error: &reqwest::Error) -> WebError {
    let messages = source_messages(error);
    if messages
        .iter()
        .any(|message| message.contains(NON_PUBLIC_ADDRESS))
    {
        return WebError::Failed(NON_PUBLIC_ADDRESS.into());
    }
    if error.is_timeout() {
        return WebError::Unreachable("the request took too long".into());
    }
    if error.is_connect() {
        let reason = messages.last().cloned().unwrap_or_default();
        return WebError::Unreachable(reason);
    }
    WebError::Failed(format!("The request failed: {error}"))
}

/// The message of an error and of every error under it, outermost first.
fn source_messages(error: &reqwest::Error) -> Vec<String> {
    let mut messages = vec![error.to_string()];
    let mut source = std::error::Error::source(error);
    while let Some(inner) = source {
        messages.push(inner.to_string());
        source = inner.source();
    }
    messages
}

/// Read a response body up to `cap` bytes, then stop reading. A gzip body is unpacked after the
/// read, still capped. The bytes are never buffered past the cap.
pub(super) async fn read_body(
    mut response: Response,
    cap: usize,
) -> Result<Body, WebError> {
    let gzipped = response
        .headers()
        .get(CONTENT_ENCODING)
        .is_some_and(|value| value.as_bytes().eq_ignore_ascii_case(b"gzip"));
    let mut raw = Vec::new();
    let mut cut = false;
    while let Some(chunk) = response.chunk().await.map_err(|error| classify(&error))? {
        let room = cap.saturating_sub(raw.len());
        if chunk.len() > room {
            raw.extend_from_slice(&chunk[..room]);
            cut = true;
            break;
        }
        raw.extend_from_slice(&chunk);
    }
    if gzipped {
        gunzip_capped(&raw, cap, cut).map_err(WebError::Failed)
    } else {
        Ok(Body { bytes: raw, cut })
    }
}

/// Unpack a gzip body, keeping at most `cap` bytes. When the raw body was already cut, a stream
/// that ends early is kept as far as it went.
pub(super) fn gunzip_capped(raw: &[u8], cap: usize, raw_cut: bool) -> Result<Body, String> {
    let limit = u64::try_from(cap).unwrap_or(u64::MAX).saturating_add(1);
    let mut decoded = Vec::new();
    match GzDecoder::new(raw).take(limit).read_to_end(&mut decoded) {
        Ok(_) => {}
        Err(_) if raw_cut => {}
        Err(error) => {
            return Err(format!(
                "The compressed response could not be unpacked: {error}"
            ))
        }
    }
    let cut = raw_cut || decoded.len() > cap;
    decoded.truncate(cap);
    Ok(Body {
        bytes: decoded,
        cut,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::str::FromStr;

    fn ip(text: &str) -> IpAddr {
        text.parse().expect("test address")
    }

    #[test]
    fn public_addresses_are_allowed() {
        for text in [
            "8.8.8.8",
            "1.1.1.1",
            "93.184.216.34",
            "172.32.0.1",
            "100.128.0.1",
            "2606:4700:4700::1111",
            "::ffff:8.8.8.8",
        ] {
            assert!(is_public_ip(ip(text)), "{text} should be public");
        }
    }

    #[test]
    fn private_and_reserved_addresses_are_refused() {
        for text in [
            "127.0.0.1",
            "127.255.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "100.127.255.255",
            "0.0.0.0",
            "0.1.2.3",
            "224.0.0.1",
            "255.255.255.255",
            "192.0.2.1",
            "198.18.0.1",
            "240.0.0.1",
            "::1",
            "::",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "ff02::1",
            "2001:db8::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:100.64.0.1",
            "64:ff9b::a9fe:a9fe",
        ] {
            assert!(!is_public_ip(ip(text)), "{text} should be refused");
        }
    }

    #[test]
    fn destination_accepts_public_http_and_https() {
        for text in [
            "https://example.com/page",
            "http://example.org:8080/a?b=1",
            "https://8.8.8.8/",
        ] {
            let url = Url::parse(text).expect("url");
            assert_eq!(check_destination(&url), Ok(()), "{text}");
        }
    }

    #[test]
    fn destination_refuses_other_schemes_credentials_and_private_literals() {
        let cases = [
            ("ftp://example.com/file", "Only http and https"),
            ("file:///etc/hosts", "Only http and https"),
            ("https://user:secret@example.com/", "username or password"),
            ("https://user@example.com/", "username or password"),
            ("http://127.0.0.1/", NON_PUBLIC_ADDRESS),
            ("http://[::1]/", NON_PUBLIC_ADDRESS),
            ("http://169.254.169.254/latest/meta-data", NON_PUBLIC_ADDRESS),
            ("http://10.0.0.5/", NON_PUBLIC_ADDRESS),
            ("http://[::ffff:192.168.0.1]/", NON_PUBLIC_ADDRESS),
        ];
        for (text, expected) in cases {
            let url = Url::parse(text).expect("url");
            let refusal = check_destination(&url).expect_err(text);
            assert!(refusal.contains(expected), "{text}: {refusal}");
        }
    }

    #[test]
    fn public_addresses_keep_only_the_public_ones_in_order() {
        let found = [
            "127.0.0.1:443",
            "10.0.0.2:443",
            "93.184.216.34:443",
            "[fe80::1]:443",
            "8.8.4.4:443",
        ]
        .into_iter()
        .map(|text| SocketAddr::from_str(text).expect("socket address"));
        let public: Vec<String> = public_addresses(found)
            .iter()
            .map(SocketAddr::to_string)
            .collect();
        assert_eq!(public, ["93.184.216.34:443", "8.8.4.4:443"]);
    }

    #[tokio::test]
    async fn resolver_refuses_a_private_literal_and_keeps_a_public_one() {
        let refused = resolve_public("127.0.0.1".into()).await;
        let refusal = refused.err().expect("refused").to_string();
        assert_eq!(refusal, NON_PUBLIC_ADDRESS);

        let addrs = resolve_public("8.8.8.8".into()).await.expect("public");
        let kept: Vec<SocketAddr> = addrs.collect();
        assert_eq!(kept, [SocketAddr::from_str("8.8.8.8:0").expect("addr")]);
    }

    #[test]
    fn redirects_resolve_relative_and_absolute_locations() {
        let current = Url::parse("https://example.com/a/b").expect("url");
        let relative = next_location(&current, StatusCode::FOUND, Some("../c?x=1"));
        assert_eq!(
            relative.expect("ok").expect("redirect").as_str(),
            "https://example.com/c?x=1"
        );
        let absolute = next_location(
            &current,
            StatusCode::MOVED_PERMANENTLY,
            Some("https://other.example/"),
        );
        assert_eq!(
            absolute.expect("ok").expect("redirect").as_str(),
            "https://other.example/"
        );
    }

    #[test]
    fn a_final_response_is_not_a_redirect() {
        let current = Url::parse("https://example.com/").expect("url");
        assert_eq!(next_location(&current, StatusCode::OK, None), Ok(None));
        assert_eq!(
            next_location(&current, StatusCode::NOT_FOUND, Some("/x")),
            Ok(None)
        );
        assert_eq!(
            next_location(&current, StatusCode::NOT_MODIFIED, None),
            Ok(None)
        );
    }

    #[test]
    fn a_redirect_without_a_location_is_a_failure() {
        let current = Url::parse("https://example.com/").expect("url");
        let refusal =
            next_location(&current, StatusCode::SEE_OTHER, None).expect_err("no location");
        assert_eq!(refusal, "The site redirected without a new address (HTTP 303).");
        assert!(next_location(&current, StatusCode::FOUND, Some("http://[bad")).is_err());
    }

    #[test]
    fn gzip_bodies_are_unpacked_and_capped() {
        let original = "x".repeat(5000);
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(original.as_bytes()).expect("compress");
        let packed = encoder.finish().expect("finish");

        let whole = gunzip_capped(&packed, 10_000, false).expect("unpack");
        assert_eq!(whole.bytes, original.as_bytes());
        assert!(!whole.cut);

        let capped = gunzip_capped(&packed, 1000, false).expect("unpack");
        assert_eq!(capped.bytes.len(), 1000);
        assert!(capped.cut);
    }

    #[test]
    fn a_corrupt_gzip_body_is_a_failure_unless_the_raw_body_was_cut() {
        let garbage = b"not gzip at all";
        assert!(gunzip_capped(garbage, 100, false)
            .expect_err("corrupt")
            .starts_with("The compressed response could not be unpacked"));
        let kept = gunzip_capped(garbage, 100, true).expect("kept what decoded");
        assert!(kept.bytes.is_empty());
        assert!(kept.cut);
    }

    #[test]
    fn the_user_agent_names_the_app_version_and_project() {
        assert!(USER_AGENT.starts_with("LocalGenie/"));
        assert!(USER_AGENT.contains(env!("CARGO_PKG_VERSION")));
        assert!(USER_AGENT.ends_with("(+https://github.com/andrew-c0/LocalGenie)"));
    }

    #[test]
    fn the_web_client_builds_without_the_network() {
        assert!(web_client().is_ok());
    }

    #[test]
    fn web_errors_read_as_the_model_and_frontend_expect() {
        let offline = WebError::Unreachable("the request took too long".into());
        assert_eq!(
            offline.message(),
            "Could not reach the web: the request took too long"
        );
        let refused = WebError::Failed(NON_PUBLIC_ADDRESS.into());
        assert_eq!(String::from(refused), NON_PUBLIC_ADDRESS);
    }
}
