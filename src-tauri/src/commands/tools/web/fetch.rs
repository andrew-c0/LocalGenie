//! `web_fetch`: read one page or text file. Every hop is checked before it is requested (scheme,
//! credentials, public address, robots.txt); the body is capped; the text is read in windows by
//! `start`, so a long page reads in parts.
use super::client::{self, check_destination};
use super::html_text::html_to_text;
use super::robots::RobotsCache;
use crate::commands::tools::limits::{CONTENT_MAX_CHARS, FETCH_MAX_BYTES, MAX_REDIRECTS};
use crate::commands::tools::output::shorten_chars;
use crate::commands::tools::ToolOutput;
use reqwest::header::CONTENT_TYPE;
use reqwest::{Client, Response, StatusCode};
use url::Url;

const ROBOTS_REFUSED: &str = "The site's robots.txt does not allow this page.";
const TOO_MANY_REDIRECTS: &str = "The page redirected more than 5 times, so it is not read.";
const NO_TEXT: &str = "(the page has no readable text)";
/// Most characters of the `Source:` address kept in the header, so a long link cannot crowd out the text.
const SOURCE_MAX_CHARS: usize = 1000;
/// Room kept at the end of a window for the truncation note.
const NOTE_RESERVE: usize = 160;

/// How the body of an accepted page is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BodyKind {
    Html,
    Text,
}

/// Read the page at `input` and return the window of its text that starts at `start` characters.
pub(super) async fn fetch_page(
    input: &str,
    start: usize,
    client: &Client,
    robots: &RobotsCache,
) -> Result<ToolOutput, String> {
    let mut url = parse_public_url(input)?;
    let mut hops = 0;
    loop {
        if !robots.allows(client, &url).await? {
            return Err(ROBOTS_REFUSED.into());
        }
        let response = client::send_get(client, url.clone()).await?;
        match client::redirect_target(&url, &response)? {
            None => return read_page(&url, response, start).await,
            Some(next) => {
                hops += 1;
                if hops > MAX_REDIRECTS {
                    return Err(TOO_MANY_REDIRECTS.into());
                }
                check_destination(&next)?;
                url = next;
            }
        }
    }
}

/// A URL the user typed, checked before any request: it parses, uses http or https, has no
/// credentials and, when it names an IP address, names a public one.
fn parse_public_url(input: &str) -> Result<Url, String> {
    let url = Url::parse(input.trim())
        .map_err(|error| format!("The address is not a valid URL: {error}"))?;
    check_destination(&url)?;
    Ok(url)
}

/// Turn a final response into the tool output: a status check, a content type check, the capped
/// body, its readable text, and the window.
async fn read_page(url: &Url, response: Response, start: usize) -> Result<ToolOutput, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("The page returned HTTP {status}."));
    }
    let kind = kind_for(content_type(&response).as_deref())?;
    let body = client::read_body(response, FETCH_MAX_BYTES).await?;
    let raw = String::from_utf8_lossy(&body.bytes);
    let text = match kind {
        BodyKind::Html => html_to_text(&raw),
        BodyKind::Text => plain_text(&raw),
    };
    page_output(url.as_str(), status, &text, body.cut, start)
}

fn content_type(response: &Response) -> Option<String> {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

/// The body kind of a content type, or the refusal that names the type. Only text is read.
fn kind_for(content_type: Option<&str>) -> Result<BodyKind, String> {
    let mime = content_type
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "" => Err("The page has no content type, so it cannot be read as text.".into()),
        "text/html" | "application/xhtml+xml" => Ok(BodyKind::Html),
        "text/plain" | "text/markdown" | "application/json" | "application/xml" | "text/xml" => {
            Ok(BodyKind::Text)
        }
        other => Err(format!(
            "This page is of type {other}. web_fetch reads text pages only: HTML, plain text, Markdown, JSON and XML."
        )),
    }
}

/// Text files keep their words; only the line endings and the ends are tidied.
fn plain_text(raw: &str) -> String {
    raw.replace("\r\n", "\n").trim().to_string()
}

/// The tool output: a `Source:` and `Status:` header, a blank line, then the text from `start`
/// up to the size cap. A window that stops early says where to continue.
fn page_output(
    source: &str,
    status: StatusCode,
    text: &str,
    cut: bool,
    start: usize,
) -> Result<ToolOutput, String> {
    let total = text.chars().count();
    if start > 0 && start >= total {
        return Err(format!(
            "start is past the end of the page, which has {total} characters."
        ));
    }
    let mut header = format!(
        "Source: {}\nStatus: {status}\n",
        shorten_chars(source, SOURCE_MAX_CHARS)
    );
    if cut {
        header.push_str("Note: only the first 2 MiB of the page was read.\n");
    }
    header.push('\n');
    if total == 0 {
        return Ok(ToolOutput {
            content: format!("{header}{NO_TEXT}"),
            truncated: cut,
            attachment: None,
        });
    }

    let budget = CONTENT_MAX_CHARS.saturating_sub(header.chars().count() + NOTE_RESERVE);
    let window: String = text.chars().skip(start).take(budget).collect();
    let end = start + window.chars().count();
    let more = end < total;
    let mut content = format!("{header}{window}");
    if more {
        content.push_str(&format!(
            "\n[truncated: showing characters {}-{end} of {total}; call again with start={end} to read on]",
            start + 1
        ));
    }
    Ok(ToolOutput {
        content,
        truncated: more || cut,
        attachment: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tools::web::client::web_client;

    fn check_input(input: &str) -> Result<Url, String> {
        parse_public_url(input)
    }

    fn window(text: &str, start: usize) -> Result<ToolOutput, String> {
        page_output("https://example.com/p", StatusCode::OK, text, false, start)
    }

    fn body_after_header(content: &str) -> &str {
        content.split_once("\n\n").map_or("", |(_, body)| body)
    }

    #[test]
    fn only_http_and_https_addresses_are_read() {
        assert!(check_input("https://example.com/a?b=c").is_ok());
        assert!(check_input("http://example.org").is_ok());
        for input in ["ftp://example.com/x", "file:///C:/secret.txt", "javascript:alert(1)"] {
            let refusal = check_input(input).expect_err(input);
            assert!(refusal.starts_with("Only http and https"), "{input}: {refusal}");
        }
    }

    #[test]
    fn addresses_with_credentials_are_refused() {
        for input in [
            "https://user:pass@example.com/",
            "https://user@example.com/",
            "https://:pass@example.com/",
        ] {
            let refusal = check_input(input).expect_err(input);
            assert!(refusal.contains("username or password"), "{input}");
        }
    }

    #[test]
    fn private_and_metadata_addresses_are_refused_before_any_request() {
        for input in [
            "http://127.0.0.1:8080/",
            "http://[::1]/",
            "http://169.254.169.254/latest/meta-data/",
            "http://192.168.1.10/router",
            "http://100.64.1.1/",
            "http://[fd00::5]/",
            "http://[::ffff:10.1.1.1]/",
        ] {
            let refusal = check_input(input).expect_err(input);
            assert_eq!(refusal, client::NON_PUBLIC_ADDRESS, "{input}");
        }
    }

    #[test]
    fn an_address_that_is_not_a_url_is_a_readable_failure() {
        let refusal = check_input("not a url").expect_err("invalid");
        assert!(refusal.starts_with("The address is not a valid URL"));
    }

    #[test]
    fn html_text_and_plain_text_content_types_are_accepted() {
        assert_eq!(kind_for(Some("text/html; charset=utf-8")), Ok(BodyKind::Html));
        assert_eq!(kind_for(Some("Text/HTML")), Ok(BodyKind::Html));
        assert_eq!(kind_for(Some("application/xhtml+xml")), Ok(BodyKind::Html));
        for mime in [
            "text/plain",
            "text/markdown",
            "application/json",
            "application/xml",
            "text/xml",
        ] {
            assert_eq!(kind_for(Some(mime)), Ok(BodyKind::Text), "{mime}");
        }
    }

    #[test]
    fn other_content_types_are_refused_by_name() {
        let refusal = kind_for(Some("image/png")).expect_err("image");
        assert!(refusal.contains("image/png"), "{refusal}");
        let pdf = kind_for(Some("application/pdf; name=x.pdf")).expect_err("pdf");
        assert!(pdf.contains("application/pdf"), "{pdf}");
    }

    #[test]
    fn a_missing_content_type_is_refused() {
        assert!(kind_for(None).expect_err("missing").contains("no content type"));
        assert!(kind_for(Some("  ; charset=x")).is_err());
    }

    #[test]
    fn the_header_names_the_source_and_the_status() {
        let output = page_output(
            "https://example.com/final",
            StatusCode::OK,
            "Hello",
            false,
            0,
        )
        .expect("page");
        assert_eq!(
            output.content,
            "Source: https://example.com/final\nStatus: 200 OK\n\nHello"
        );
        assert!(!output.truncated);
    }

    #[test]
    fn a_long_page_is_cut_with_a_note_that_says_where_to_continue() {
        let text = "w".repeat(CONTENT_MAX_CHARS * 2);
        let output = window(&text, 0).expect("page");
        assert!(output.truncated);
        assert!(output.content.chars().count() <= CONTENT_MAX_CHARS);
        assert!(output.content.contains("[truncated: showing characters 1-"));
        assert!(output.content.contains("call again with start="));
    }

    #[test]
    fn start_reads_on_from_the_given_character() {
        let text: String = (0..20_000)
            .map(|index| char::from(b'a' + u8::try_from(index % 26).unwrap_or(0)))
            .collect();
        let first = window(&text, 0).expect("first");
        let next_start = first
            .content
            .rsplit("start=")
            .next()
            .and_then(|rest| rest.split(' ').next())
            .and_then(|digits| digits.parse::<usize>().ok())
            .expect("next start in the note");

        let second = window(&text, next_start).expect("second");
        let expected: String = text.chars().skip(next_start).take(10).collect();
        assert!(body_after_header(&second.content).starts_with(&expected));
        assert!(second.content.contains(&format!("showing characters {}-", next_start + 1)));
    }

    #[test]
    fn the_last_window_is_not_marked_as_cut() {
        let text = "x".repeat(100);
        let output = window(&text, 90).expect("tail");
        assert!(!output.truncated);
        assert!(body_after_header(&output.content).ends_with(&"x".repeat(10)));
        assert!(!output.content.contains("[truncated"));
    }

    #[test]
    fn a_start_past_the_end_is_a_readable_failure() {
        let refusal = window("short", 5).expect_err("past end");
        assert!(refusal.starts_with("start is past the end of the page, which has 5 characters"));
        assert!(window("", 0).is_ok());
        assert!(window("", 1).is_err());
    }

    #[test]
    fn a_page_with_no_text_says_so() {
        let output = window("", 0).expect("empty");
        assert!(output.content.ends_with(NO_TEXT));
    }

    #[test]
    fn a_body_cut_at_the_byte_cap_is_marked_in_the_header() {
        let output = page_output(
            "https://example.com/big",
            StatusCode::OK,
            "text",
            true,
            0,
        )
        .expect("cut");
        assert!(output.truncated);
        assert!(output.content.contains("Note: only the first 2 MiB of the page was read."));
    }

    #[test]
    fn a_very_long_source_address_cannot_crowd_out_the_text() {
        let long = format!("https://example.com/{}", "p".repeat(5000));
        let text = "t".repeat(CONTENT_MAX_CHARS * 2);
        let output = page_output(&long, StatusCode::OK, &text, false, 0).expect("long source");
        assert!(output.content.chars().count() <= CONTENT_MAX_CHARS);
        assert!(output.content.starts_with("Source: https://example.com/ppp"));
        assert!(output.content.contains("...\nStatus: 200 OK"));
    }

    #[test]
    fn plain_text_keeps_its_words_and_line_breaks() {
        assert_eq!(plain_text("  {\r\n  \"a\": 1\r\n}\n "), "{\n  \"a\": 1\n}");
    }

    #[tokio::test]
    async fn a_refused_start_never_reaches_the_network() {
        let client = web_client().expect("client");
        let robots = RobotsCache::new();
        let refusal = fetch_page("http://127.0.0.1/secret", 0, &client, &robots)
            .await
            .expect_err("private");
        assert_eq!(refusal, client::NON_PUBLIC_ADDRESS);
        let scheme = fetch_page("file:///etc/hosts", 0, &client, &robots)
            .await
            .expect_err("file");
        assert!(scheme.starts_with("Only http and https"));
    }
}
