//! Page text decoding. The charset comes from the first of: a UTF-8 byte order mark, the
//! `charset=` of the Content-Type header, a `<meta>` tag in the first bytes of the body, and UTF-8.
use encoding_rs::{Encoding, UTF_8};

/// How far into the body a `<meta>` charset is looked for.
const META_SNIFF_BYTES: usize = 2048;
const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

/// Decode a page body to text. Invalid bytes become U+FFFD; an unknown label reads as UTF-8.
pub(super) fn decode_text(bytes: &[u8], content_type: Option<&str>) -> String {
    if let Some(rest) = bytes.strip_prefix(UTF8_BOM) {
        return UTF_8.decode_without_bom_handling(rest).0.into_owned();
    }
    let prefix = &bytes[..bytes.len().min(META_SNIFF_BYTES)];
    let encoding = declared_encoding(content_type, prefix);
    encoding.decode_without_bom_handling(bytes).0.into_owned()
}

/// The encoding a page declares. The header is authoritative when it has a `charset=`. A `<meta>`
/// that names an ASCII-incompatible encoding (UTF-16) is ignored, since its own bytes are ASCII.
fn declared_encoding(content_type: Option<&str>, prefix: &[u8]) -> &'static Encoding {
    if let Some(label) = content_type.and_then(charset_label) {
        return Encoding::for_label(label.as_bytes()).unwrap_or(UTF_8);
    }
    meta_charset(&String::from_utf8_lossy(prefix))
        .and_then(|label| Encoding::for_label(label.as_bytes()))
        .filter(|encoding| encoding.is_ascii_compatible())
        .unwrap_or(UTF_8)
}

/// The label of the `<meta>` tag that declares a charset, in either form: `<meta charset=...>` or
/// `<meta http-equiv="Content-Type" content="...; charset=...">`.
fn meta_charset(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut rest = lower.as_str();
    while let Some(at) = rest.find("<meta") {
        let after = &rest["<meta".len() + at..];
        let tag = after.split('>').next().unwrap_or_default();
        if let Some(label) = charset_label(tag) {
            return Some(label);
        }
        rest = after;
    }
    None
}

/// The value of the first `charset=` in `text`, without quotes. The case of `text` is ignored.
fn charset_label(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let after_name = lower.split_once("charset")?.1;
    let value = after_name.trim_start().strip_prefix('=')?.trim_start();
    let value = value.trim_start_matches(['"', '\'']);
    let label: String = value
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.'))
        .collect();
    (!label.is_empty()).then_some(label)
}

#[cfg(test)]
mod tests {
    use super::decode_text;

    /// `café` in windows-1252: the é is the single byte 0xE9.
    const CAFE_1252: &[u8] = b"caf\xE9";

    #[test]
    fn a_header_charset_decodes_the_page() {
        let mut body = b"<html><body><p>".to_vec();
        body.extend_from_slice(CAFE_1252);
        body.extend_from_slice(b"</p></body></html>");
        let text = decode_text(&body, Some("text/html; charset=windows-1252"));
        assert!(text.contains("<p>café</p>"), "{text}");
    }

    #[test]
    fn a_meta_charset_decodes_the_page_when_the_header_has_none() {
        let mut body = b"<html><head><meta charset=\"windows-1252\"></head><body>".to_vec();
        body.extend_from_slice(CAFE_1252);
        body.extend_from_slice(b"</body></html>");
        assert!(decode_text(&body, Some("text/html")).contains("café"));
        assert!(decode_text(&body, None).contains("café"));
    }

    #[test]
    fn an_http_equiv_meta_charset_decodes_the_page() {
        let mut body = b"<html><head><META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=iso-8859-1\"></head><body>".to_vec();
        body.extend_from_slice(CAFE_1252);
        body.extend_from_slice(b"</body></html>");
        assert!(decode_text(&body, Some("text/html")).contains("café"));
    }

    #[test]
    fn a_header_charset_wins_over_a_meta_charset() {
        let mut body = b"<meta charset=\"windows-1252\">".to_vec();
        body.extend_from_slice("café".as_bytes());
        let text = decode_text(&body, Some("text/html; charset=utf-8"));
        assert!(text.ends_with("café"), "{text}");
    }

    #[test]
    fn a_meta_charset_after_the_sniffed_bytes_is_ignored() {
        let mut body = vec![b' '; 2100];
        body.extend_from_slice(b"<meta charset=\"windows-1252\">");
        body.extend_from_slice(CAFE_1252);
        let text = decode_text(&body, Some("text/html"));
        assert!(text.contains('\u{FFFD}'), "the late meta must not apply");
    }

    #[test]
    fn utf8_with_a_bom_is_read_as_utf8_and_the_bom_is_dropped() {
        let mut body = vec![0xEF, 0xBB, 0xBF];
        body.extend_from_slice("café".as_bytes());
        let text = decode_text(&body, Some("text/plain; charset=windows-1252"));
        assert_eq!(text, "café");
    }

    #[test]
    fn an_unknown_label_falls_back_to_utf8_lossy() {
        let text = decode_text("café".as_bytes(), Some("text/plain; charset=no-such-set"));
        assert_eq!(text, "café");

        let broken = decode_text(b"a\xFFb", Some("text/plain; charset=no-such-set"));
        assert_eq!(broken, "a\u{FFFD}b");
    }

    #[test]
    fn a_page_without_a_declared_charset_is_utf8() {
        let text = decode_text("café".as_bytes(), Some("text/html"));
        assert_eq!(text, "café");
    }

    #[test]
    fn a_quoted_or_bare_header_label_is_read() {
        let quoted = decode_text(CAFE_1252, Some("text/plain; charset=\"windows-1252\""));
        assert_eq!(quoted, "café");
        let bare = decode_text(CAFE_1252, Some("text/plain;charset=WINDOWS-1252"));
        assert_eq!(bare, "café");
    }
}
