//! Readable text from HTML, and the text helpers the web tools share: entity decoding, whitespace
//! and tag stripping for search snippets. A small hand-written reader; no HTML parser is needed for
//! the readable text of a page.

/// Elements whose text is raw code or markup, skipped up to their closing tag.
const RAW_TEXT: [&str; 2] = ["script", "style"];

/// Elements whose content is never shown: embedded markup, the head and the page furniture.
/// Their nesting is counted, so a nested element of the same name does not end the skip early.
const SKIPPED: [&str; 5] = ["noscript", "svg", "head", "nav", "footer"];

/// Elements that start a new block: a blank line before and after their text.
const BLOCK_TAGS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "dd",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "main",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tr",
    "ul",
];

/// The longest entity name read after `&` (the longest name in the table is 6 letters).
const MAX_ENTITY_NAME: usize = 10;

/// The readable text of an HTML page: the title on the first line, a blank line, then the blocks.
/// Scripts, styles and the skipped elements are dropped; headings, paragraphs and list items are
/// kept as plain text with a blank line between blocks; link text stays, the links do not.
pub(super) fn html_to_text(html: &str) -> String {
    let mut page = Page::default();
    let mut skipped: Option<Skipped> = None;
    let mut cursor = 0;
    while cursor < html.len() {
        let next_markup = html[cursor..]
            .find('<')
            .map_or(html.len(), |offset| cursor + offset);
        if skipped.is_none() {
            page.text(&html[cursor..next_markup]);
        }
        if next_markup == html.len() {
            break;
        }
        cursor = match markup(html, next_markup) {
            Markup::Literal => {
                if skipped.is_none() {
                    page.text("<");
                }
                next_markup + 1
            }
            Markup::Skip(end) => end,
            Markup::Tag(tag) => apply_tag(html, &tag, &mut page, &mut skipped),
        };
    }
    page.finish()
}

/// The readable text of a fragment with its tags removed and entities decoded, on one line.
/// Used for search snippets, which carry highlight tags.
pub(super) fn plain_snippet(fragment: &str) -> String {
    let mut text = String::with_capacity(fragment.len());
    let mut in_tag = false;
    for ch in fragment.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    collapse_whitespace(&decode_entities(&text))
}

/// Runs of whitespace become one space; the ends are trimmed.
pub(super) fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Replace the HTML entities in `text` with their characters. Unknown or malformed entities stay
/// as they are.
pub(super) fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp + 1..];
        match decode_one(after) {
            Some((ch, used)) => {
                out.push(ch);
                rest = &after[used..];
            }
            None => {
                out.push('&');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// The character of the entity whose name starts `after` (just past its `&`), and the bytes the
/// name and its `;` take.
fn decode_one(after: &str) -> Option<(char, usize)> {
    let semicolon = after
        .bytes()
        .take(MAX_ENTITY_NAME + 1)
        .position(|byte| byte == b';')?;
    let name = &after[..semicolon];
    let ch = match name.strip_prefix('#') {
        Some(number) => numeric_entity(number)?,
        None => named_entity(name)?,
    };
    Some((ch, semicolon + 1))
}

/// `#65` or `#x41`: a code point. Invalid code points are not decoded.
fn numeric_entity(number: &str) -> Option<char> {
    let code = match number.strip_prefix(['x', 'X']) {
        Some(hex) => u32::from_str_radix(hex, 16).ok()?,
        None => number.parse().ok()?,
    };
    char::from_u32(code)
}

/// The named entities that show up in ordinary pages. `nbsp` becomes a plain space.
fn named_entity(name: &str) -> Option<char> {
    Some(match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        "nbsp" => ' ',
        "copy" => '\u{a9}',
        "reg" => '\u{ae}',
        "trade" => '\u{2122}',
        "hellip" => '\u{2026}',
        "ndash" => '\u{2013}',
        "mdash" => '\u{2014}',
        "lsquo" => '\u{2018}',
        "rsquo" => '\u{2019}',
        "ldquo" => '\u{201c}',
        "rdquo" => '\u{201d}',
        "bull" => '\u{2022}',
        "middot" => '\u{b7}',
        "laquo" => '\u{ab}',
        "raquo" => '\u{bb}',
        "euro" => '\u{20ac}',
        "pound" => '\u{a3}',
        "yen" => '\u{a5}',
        "cent" => '\u{a2}',
        "sect" => '\u{a7}',
        "deg" => '\u{b0}',
        "times" => '\u{d7}',
        "frac12" => '\u{bd}',
        _ => return None,
    })
}

/// The text that is being skipped, and how deep the nesting of its element is.
struct Skipped {
    name: &'static str,
    depth: usize,
}

/// One tag of the markup: its lowercase name, whether it closes, whether it is self-closing, and
/// the byte just past its `>`.
struct Tag {
    name: String,
    closing: bool,
    self_closing: bool,
    end: usize,
}

enum Markup {
    /// A `<` that does not start a tag: plain text.
    Literal,
    /// A comment, doctype or processing instruction, ending at this byte.
    Skip(usize),
    Tag(Tag),
}

/// Read the markup that starts at `at` (a `<`).
fn markup(html: &str, at: usize) -> Markup {
    let bytes = html.as_bytes();
    if html[at..].starts_with("<!--") {
        let end = html[at + 4..]
            .find("-->")
            .map_or(html.len(), |offset| at + 4 + offset + 3);
        return Markup::Skip(end);
    }
    if matches!(bytes.get(at + 1), Some(b'!' | b'?')) {
        return Markup::Skip(tag_close(bytes, at + 1).0);
    }
    let closing = bytes.get(at + 1) == Some(&b'/');
    let name_start = if closing { at + 2 } else { at + 1 };
    if !bytes.get(name_start).is_some_and(u8::is_ascii_alphabetic) {
        return Markup::Literal;
    }
    let name_len = bytes[name_start..]
        .iter()
        .take_while(|byte| byte.is_ascii_alphanumeric() || **byte == b'-')
        .count();
    let name_end = name_start + name_len;
    let name = html[name_start..name_end].to_ascii_lowercase();
    let (end, self_closing) = tag_close(bytes, name_end);
    Markup::Tag(Tag {
        name,
        closing,
        self_closing,
        end,
    })
}

/// The byte just past the `>` that ends a tag, and whether the tag is self-closing (`/>`). A `>`
/// inside a quoted attribute value does not end the tag.
fn tag_close(bytes: &[u8], from: usize) -> (usize, bool) {
    let mut quote: Option<u8> = None;
    for (offset, &byte) in bytes[from..].iter().enumerate() {
        let index = from + offset;
        match quote {
            Some(open) => {
                if byte == open {
                    quote = None;
                }
            }
            None => match byte {
                b'"' | b'\'' => quote = Some(byte),
                b'>' => {
                    let self_closing = index > from && bytes[index - 1] == b'/';
                    return (index + 1, self_closing);
                }
                _ => {}
            },
        }
    }
    (bytes.len(), false)
}

/// The closing tag `</name` after `from` (ASCII case ignored). Returns where the content ends and
/// where the closing tag ends, or `None` when the page has no such closing tag.
fn find_closing(html: &str, from: usize, name: &str) -> Option<(usize, usize)> {
    let bytes = html.as_bytes();
    let needle = format!("</{name}");
    let needle = needle.as_bytes();
    let offset = bytes[from..]
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle))?;
    let start = from + offset;
    Some((start, tag_close(bytes, start + needle.len()).0))
}

/// Apply one tag to the page and return where reading goes on.
fn apply_tag(
    html: &str,
    tag: &Tag,
    page: &mut Page,
    skipped: &mut Option<Skipped>,
) -> usize {
    let name = tag.name.as_str();
    let title_readable = skipped.as_ref().is_none_or(|current| current.name == "head");
    if !tag.closing && name == "title" && page.title.is_none() && title_readable {
        if let Some((content_end, after)) = find_closing(html, tag.end, "title") {
            page.title = Some(collapse_whitespace(&decode_entities(
                &html[tag.end..content_end],
            )));
            return after;
        }
    }
    if !tag.closing && !tag.self_closing {
        if let Some(raw) = RAW_TEXT.iter().copied().find(|raw| *raw == name) {
            // Raw text runs to its closing tag; a page that never closes it loses the rest.
            return find_closing(html, tag.end, raw).map_or(html.len(), |(_, after)| after);
        }
    }
    if let Some(nested) = SKIPPED.iter().copied().find(|candidate| *candidate == name) {
        track_skipped(nested, tag, skipped);
        return tag.end;
    }
    if name == "body" && !tag.closing && skipped.as_ref().is_some_and(|s| s.name == "head") {
        // A page with no closing </head> still has a body: stop skipping at it.
        *skipped = None;
    }
    if skipped.is_some() {
        return tag.end;
    }
    match name {
        "br" => page.break_lines(1),
        "li" if !tag.closing => {
            page.break_lines(1);
            page.text("- ");
        }
        "td" | "th" => page.text(" "),
        _ if BLOCK_TAGS.contains(&name) => page.break_lines(2),
        _ => {}
    }
    tag.end
}

/// Count the opening and closing tags of a skipped element, so the skip ends at its own close.
fn track_skipped(name: &'static str, tag: &Tag, skipped: &mut Option<Skipped>) {
    match skipped {
        None => {
            if !tag.closing && !tag.self_closing {
                *skipped = Some(Skipped { name, depth: 1 });
            }
        }
        Some(current) if current.name == name => {
            if tag.closing {
                current.depth = current.depth.saturating_sub(1);
            } else if !tag.self_closing {
                current.depth += 1;
            }
            if current.depth == 0 {
                *skipped = None;
            }
        }
        Some(_) => {}
    }
}

/// The text collected so far. Whitespace is collapsed; a block break is written only before the
/// next visible character, so the output never starts or ends with blank lines.
#[derive(Default)]
struct Page {
    out: String,
    breaks: usize,
    space: bool,
    title: Option<String>,
}

impl Page {
    fn text(&mut self, raw: &str) {
        for ch in decode_entities(raw).chars() {
            if ch.is_whitespace() {
                self.space = true;
                continue;
            }
            if !self.out.is_empty() {
                if self.breaks > 0 {
                    self.out.push_str(&"\n".repeat(self.breaks));
                } else if self.space {
                    self.out.push(' ');
                }
            }
            self.breaks = 0;
            self.space = false;
            self.out.push(ch);
        }
    }

    /// A line break (1) or a blank line (2) before the next visible text.
    fn break_lines(&mut self, count: usize) {
        self.breaks = self.breaks.max(count);
    }

    fn finish(self) -> String {
        match self.title {
            Some(title) if self.out.is_empty() => title,
            Some(title) if !title.is_empty() => format!("{title}\n\n{}", self.out),
            _ => self.out,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{collapse_whitespace, decode_entities, html_to_text, plain_snippet};

    #[test]
    fn scripts_styles_and_page_furniture_are_dropped() {
        let html = r#"<html><head><title>Docs</title><style>p { color: red }</style>
            <script>var x = "<p>hidden</p>";</script></head>
            <body><nav>Menu links</nav><p>Visible text.</p>
            <noscript>Enable scripts</noscript><svg><text>icon</text></svg>
            <footer>Copyright</footer></body></html>"#;
        let text = html_to_text(html);
        assert_eq!(text, "Docs\n\nVisible text.");
    }

    #[test]
    fn the_title_comes_first_and_is_not_repeated_in_the_body() {
        let html = "<head><title>  My\n  page  </title></head><body><h1>Heading</h1><p>Text</p></body>";
        assert_eq!(html_to_text(html), "My page\n\nHeading\n\nText");
    }

    #[test]
    fn headings_and_paragraphs_are_separated_by_blank_lines() {
        let html = "<h2>Install</h2><p>Run the tool.</p><p>Then open it.</p>";
        assert_eq!(
            html_to_text(html),
            "Install\n\nRun the tool.\n\nThen open it."
        );
    }

    #[test]
    fn list_items_keep_a_dash_and_link_text_stays() {
        let html = r#"<ul><li>First <a href="/a">link</a></li><li>Second</li></ul>"#;
        assert_eq!(html_to_text(html), "- First link\n- Second");
    }

    #[test]
    fn line_breaks_and_whitespace_are_collapsed() {
        let html = "<p>one   two\n\n\tthree<br>four</p>";
        assert_eq!(html_to_text(html), "one two three\nfour");
    }

    #[test]
    fn entities_are_decoded_in_text_and_titles() {
        let html = "<title>Tom &amp; Jerry</title><p>&lt;b&gt; &quot;hi&quot; &#39;x&#39; &#x41; &copy; &nbsp;done</p>";
        assert_eq!(
            html_to_text(html),
            "Tom & Jerry\n\n<b> \"hi\" 'x' A \u{a9} done"
        );
    }

    #[test]
    fn comments_and_doctype_are_dropped_and_a_bare_less_than_is_kept() {
        let html = "<!DOCTYPE html><!-- hidden <p>comment</p> --><p>a < b</p>";
        assert_eq!(html_to_text(html), "a < b");
    }

    #[test]
    fn a_nested_element_of_the_same_name_does_not_end_the_skip_early() {
        let html = "<nav><nav>inner</nav>still hidden</nav><p>shown</p>";
        assert_eq!(html_to_text(html), "shown");
    }

    #[test]
    fn a_page_without_a_closing_head_still_shows_its_body() {
        let html = "<html><head><title>T</title><body><p>Body text</p></body></html>";
        assert_eq!(html_to_text(html), "T\n\nBody text");
    }

    #[test]
    fn a_closing_script_tag_in_a_string_does_not_matter_after_the_real_one() {
        let html = "<script>if (a<b) { x(); }</script><p>after</p>";
        assert_eq!(html_to_text(html), "after");
    }

    #[test]
    fn a_title_without_a_closing_tag_is_not_taken_from_the_rest_of_the_page() {
        assert_eq!(html_to_text("<title>Broken <p>body</p>"), "Broken\n\nbody");
    }

    #[test]
    fn a_script_that_never_closes_hides_the_rest_of_the_page() {
        assert_eq!(html_to_text("<p>a</p><script>var x = 1;"), "a");
    }

    #[test]
    fn text_without_tags_is_returned_collapsed() {
        assert_eq!(html_to_text("  plain \n text  "), "plain text");
        assert_eq!(html_to_text(""), "");
    }

    #[test]
    fn unknown_and_malformed_entities_stay_as_written() {
        let kept = "a &foo; b &amp c &#xZZ; &#1114112;";
        assert_eq!(decode_entities(kept), kept);
        assert_eq!(decode_entities("&amp;amp; & &"), "&amp; & &");
    }

    #[test]
    fn snippets_lose_their_highlight_tags_and_entities() {
        let fragment = r#"<span class="searchmatch">Rust</span> &amp; <b>Cargo</b>   guide"#;
        assert_eq!(plain_snippet(fragment), "Rust & Cargo guide");
        assert_eq!(plain_snippet("&lt;b&gt;"), "<b>");
    }

    #[test]
    fn collapse_whitespace_trims_and_joins() {
        assert_eq!(collapse_whitespace("  a\n\n b\tc  "), "a b c");
    }
}
