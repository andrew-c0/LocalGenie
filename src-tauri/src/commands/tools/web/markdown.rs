//! The Markdown of an HTML page for `web_fetch`. The main content comes from Readability (a port of
//! Mozilla's algorithm); a page without one is converted whole, with its page furniture removed.
//! The data tables Readability dropped are appended to the main content. Links get absolute
//! addresses against the page's final URL. An image is never written as an address: a standalone
//! one with a caption-like alt text becomes `(Image: alt)`, the rest are dropped. Edit links and
//! citation markers go, empty list items go, and the text is tidied. When nothing readable comes
//! out, the plain-text reader of `html_text` is used instead.
use super::html_text::{collapse_whitespace, html_to_text};
use dom_query::{Document, Selection};
use dom_smoothie::Readability;
use url::Url;

/// Fewest characters of text the main content needs to be used. A shorter one is a miss.
const MIN_MAIN_CHARS: usize = 200;

/// Elements whose content is never shown in the whole-page conversion.
const FURNITURE: [&str; 9] = [
    "script", "style", "noscript", "svg", "head", "nav", "footer", "aside", "form",
];

/// Page furniture that is never content: Wikipedia's edit-section links, its citation markers (the
/// `reference` superscripts) and text that only prints.
const NOISE_SELECTOR: &str = ".mw-editsection, sup.reference, sup.noprint, span.noprint";

/// The heading and note written once before the tables appended to the article, so the model can
/// tell them apart from the article text.
const TABLES_HEADING: &str =
    "<h2>Tables</h2><p>Tables from the page (placed after the article text).</p>";

/// Fewest characters of alt text a standalone image needs to be written as `(Image: alt)`. A shorter
/// alt text (a logo, a bullet) is dropped.
const MIN_IMAGE_ALT_CHARS: usize = 8;

/// Fewest rows a table needs to be counted by the lost-table check.
const CHECKED_TABLE_MIN_ROWS: usize = 3;

/// Table text, in characters, the whole page must hold before a Readability result that kept less
/// than half of it gets the lost tables appended. Small tables (a few rows of links) do not
/// trigger the check.
const LOST_TABLE_CHARS: usize = 2000;

/// Most blank lines kept in a row.
const MAX_BLANK_LINES: usize = 2;

/// Most cells a table row may have and still be written as a Markdown table.
const MAX_TABLE_CELLS: usize = 6;

/// Most characters of cell text a table row may hold and still be written as a Markdown table.
const MAX_TABLE_ROW_CHARS: usize = 200;

/// The Markdown of an HTML page read from `base`, its final address. The parsing runs on the
/// blocking pool, so a large page does not hold up the async runtime. If the blocking task fails
/// (it panicked), the result is empty and the caller reports that the page has no readable text.
pub(super) async fn html_page_text(html: String, base: Url) -> String {
    tokio::task::spawn_blocking(move || {
        page_markdown(&html, &base).unwrap_or_else(|| html_to_text(&html))
    })
    .await
    .unwrap_or_default()
}

/// The Markdown of the page with its title first. `None` when the page has no readable text, so the
/// caller can fall back to the plain-text reader. The page's address is not repeated here: the tool
/// output names it in its own header.
fn page_markdown(html: &str, base: &Url) -> Option<String> {
    let mut readability = Readability::new(html, Some(base.as_str()), None).ok()?;
    let raw_title = collapse_whitespace(&readability.get_article_title());
    let title = without_site_name(&raw_title);
    let page = whole_page(html);
    let main = readability
        .parse()
        .ok()
        .filter(|article| enough_text(&article.text_content))
        .map(|article| with_lost_tables(Document::from(article.content), &page))
        .and_then(|main| body_markdown(main, base));
    let body = match main {
        Some(body) => body,
        None => body_markdown(page, base)?,
    };
    let markdown = if title.is_empty() {
        body
    } else {
        format!("# {title}\n\n{body}")
    };
    let tidy = tidy(&markdown);
    (!tidy.is_empty()).then_some(tidy)
}

/// The title without its site name. A trailing ` · Site` or ` - Site` is cut only when the title
/// already starts with that name: `GitHub - owner/repo: text · GitHub` becomes
/// `GitHub - owner/repo: text`, while `Rust - Wikipedia` keeps its site.
fn without_site_name(title: &str) -> &str {
    for separator in [" · ", " - "] {
        let Some((rest, site)) = title.rsplit_once(separator) else {
            continue;
        };
        let site = site.trim();
        if site.is_empty() || rest.trim().is_empty() || !title.starts_with(site) {
            continue;
        }
        return rest.trim_end();
    }
    title
}

fn enough_text(text: &str) -> bool {
    text.trim().chars().count() >= MIN_MAIN_CHARS
}

/// The whole page as a document, without its scripts, styles and page furniture.
fn whole_page(html: &str) -> Document {
    let document = Document::from(html);
    for name in FURNITURE {
        document.select(name).remove();
    }
    document
}

/// The Readability document, with the page's data tables added back when Readability dropped most of
/// them (`tables_lost`). Converting the whole page instead would put its navigation and language
/// lists in front of the article, so only the tables are appended.
fn with_lost_tables(main: Document, page: &Document) -> Document {
    if tables_lost(page, &main) {
        append_missing_tables(&main, page);
    }
    main
}

/// Whether Readability dropped the data tables of the page: the whole page holds more than
/// `LOST_TABLE_CHARS` characters of table text (in tables of at least `CHECKED_TABLE_MIN_ROWS` rows)
/// and the main content keeps less than half of that.
fn tables_lost(page: &Document, main: &Document) -> bool {
    let page_chars = checked_table_chars(page);
    page_chars > LOST_TABLE_CHARS && checked_table_chars(main) * 2 < page_chars
}

/// Appends to the end of the main content each table of the page that has no table with the same
/// text in it. A table nested in another table comes with its outer table. The tables lose their
/// place in the article, but keep their data.
fn append_missing_tables(main: &Document, page: &Document) {
    let kept: Vec<String> = main
        .select("table")
        .iter()
        .map(|table| table_key(&table))
        .collect();
    let missing: String = page
        .select("table")
        .iter()
        .filter(|table| !table.ancestors(None).is("table"))
        .filter(|table| table.select("tr").length() >= CHECKED_TABLE_MIN_ROWS)
        .filter(|table| !kept.contains(&table_key(table)))
        .map(|table| table.html().to_string())
        .collect();
    if !missing.is_empty() {
        main.select("body")
            .append_html(format!("{TABLES_HEADING}{missing}"));
    }
}

/// The text of a table with its whitespace collapsed, which identifies it across the two documents.
fn table_key(table: &Selection) -> String {
    collapse_whitespace(&table.text())
}

/// The characters of text in the tables of at least `CHECKED_TABLE_MIN_ROWS` rows.
fn checked_table_chars(document: &Document) -> usize {
    document
        .select("table")
        .iter()
        .filter(|table| table.select("tr").length() >= CHECKED_TABLE_MIN_ROWS)
        .map(|table| table.text().chars().count())
        .sum()
}

/// The Markdown of a document, after its noise, tables, links and images are prepared. `None` when
/// the Markdown is empty.
fn body_markdown(document: Document, base: &Url) -> Option<String> {
    drop_page_noise(&document);
    write_exponents(&document);
    flatten_unwritable_tables(&document);
    resolve_links(&document, base);
    resolve_images(&document);
    drop_empty_items(&document);
    let markdown = unescape_addresses(&document.md(None));
    (!markdown.trim().is_empty()).then_some(markdown)
}

/// Removes the edit-section links, the citation markers and a bracketed `[edit]` link left without
/// its section. Superscripts that stay (an exponent such as `km²`) are written as plain text by
/// `write_exponents`.
fn drop_page_noise(document: &Document) {
    document.select(NOISE_SELECTOR).remove();
    for marker in document.select("sup").iter() {
        if is_citation_marker(&marker) {
            marker.remove();
        }
    }
    for link in document.select("a").iter() {
        if link.text().trim() == "edit" && link.parent().text().trim() == "[edit]" {
            link.parent().remove();
        }
    }
}

/// Whether a superscript is a citation marker: its text is bracketed (`[12]`, `[note 3]`, `[a]`),
/// or it links to a fragment of the page (`#cite_note-1`).
fn is_citation_marker(marker: &Selection) -> bool {
    let text = marker.text();
    let text = text.trim();
    let bracketed = text.len() > 2 && text.starts_with('[') && text.ends_with(']');
    let fragment_link = marker.select("a[href]").nodes().iter().any(|link| {
        link.attr("href")
            .is_some_and(|href| href.trim().starts_with('#'))
    });
    bracketed || fragment_link
}

/// Writes each superscript that is kept (no link inside it) as plain text, with its digits and signs
/// as Unicode superscripts: `km<sup>2</sup>` reads `km²`, `10<sup>3</sup>` reads `10³`. Other
/// characters stay as they are.
fn write_exponents(document: &Document) {
    for superscript in document.select("sup").iter() {
        if !superscript.select("a[href]").exists() {
            let text = superscript_text(&superscript.text());
            superscript.replace_with_html(escape_html(&text));
        }
    }
}

/// The Unicode superscript form of the digits and signs in `text`. Other characters are kept.
fn superscript_text(text: &str) -> String {
    text.chars()
        .map(|ch| match ch {
            '0' => '⁰',
            '1' => '¹',
            '2' => '²',
            '3' => '³',
            '4' => '⁴',
            '5' => '⁵',
            '6' => '⁶',
            '7' => '⁷',
            '8' => '⁸',
            '9' => '⁹',
            '+' => '⁺',
            '-' => '⁻',
            other => other,
        })
        .collect()
}

/// The Markdown writer escapes `&`, `"` and no-break spaces in a link or image address as HTML
/// entities, which Markdown renders correctly but the model reads as noise. This reads each
/// `](address)` back, and only there: visible text that happens to show `&amp;` is left as it is.
fn unescape_addresses(markdown: &str) -> String {
    let mut out = String::with_capacity(markdown.len());
    let mut rest = markdown;
    while let Some(at) = rest.find("](") {
        let (before, from_address) = rest.split_at(at + 2);
        out.push_str(before);
        let end = address_end(from_address);
        out.push_str(&decode_address_entities(&from_address[..end]));
        rest = &from_address[end..];
    }
    out.push_str(rest);
    out
}

/// The byte where an address ends: its closing `)` (a balanced `(...)` inside it does not count),
/// or the end of the text. An address in `<...>` ends at its `>`.
fn address_end(text: &str) -> usize {
    if text.starts_with('<') {
        return text.find('>').map_or(text.len(), |close| close + 1);
    }
    let mut depth = 0usize;
    for (index, ch) in text.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' if depth == 0 => return index,
            ')' => depth -= 1,
            _ => {}
        }
    }
    text.len()
}

/// Reads the three entities the writer uses in an address, in one pass, so `&amp;quot;` becomes
/// `&quot;` and not `"`.
fn decode_address_entities(address: &str) -> String {
    const ENTITIES: [(&str, char); 3] = [("&amp;", '&'), ("&quot;", '"'), ("&nbsp;", '\u{a0}')];
    let mut out = String::with_capacity(address.len());
    let mut rest = address;
    'scan: while let Some(ch) = rest.chars().next() {
        for (entity, decoded) in ENTITIES {
            if let Some(after) = rest.strip_prefix(entity) {
                out.push(decoded);
                rest = after;
                continue 'scan;
            }
        }
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

/// Tables the Markdown writer cannot draw (rows of different lengths, a table inside a table) and
/// tables that are too wide become one block per row, the cells joined with `; `. A cell keeps its
/// HTML, so its links survive; a cell with a table inside keeps only its text.
fn flatten_unwritable_tables(document: &Document) {
    for table in document.select("table").iter() {
        if let Some(blocks) = row_blocks(&table) {
            table.replace_with_html(blocks);
        }
    }
}

/// The blocks that replace a table, or `None` when the table can stay a Markdown table.
fn row_blocks(table: &Selection) -> Option<String> {
    let rows: Vec<Vec<Selection>> = table
        .select("tr")
        .iter()
        .map(|row| {
            row.children()
                .iter()
                .filter(|cell| cell.is("td, th"))
                .collect()
        })
        .filter(|cells: &Vec<Selection>| !cells.is_empty())
        .collect();
    let regular = rows.windows(2).all(|pair| pair[0].len() == pair[1].len());
    let nested = table.select("table").exists();
    let too_wide = rows.iter().any(|cells| {
        cells.len() > MAX_TABLE_CELLS
            || cells
                .iter()
                .map(|cell| cell.text().trim().chars().count())
                .sum::<usize>()
                > MAX_TABLE_ROW_CHARS
    });
    if regular && !nested && !too_wide {
        return None;
    }
    Some(
        rows.iter()
            .map(|cells| {
                let joined = cells.iter().map(cell_html).collect::<Vec<_>>().join("; ");
                format!("<div>{joined}</div>")
            })
            .collect(),
    )
}

/// The HTML of a table cell, or its escaped text when the cell holds a table.
fn cell_html(cell: &Selection) -> String {
    if cell.select("table").exists() {
        escape_html(&collapse_whitespace(&cell.text()))
    } else {
        cell.inner_html().to_string()
    }
}

/// Escapes the three characters that would start markup in text written as HTML.
fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Links get absolute addresses, and their tooltip (`title`) is dropped, so a link reads
/// `[text](address)`. A link that leads nowhere (a script, mail or a fragment) keeps only its text.
/// A link with no text of its own (a badge, a linked picture) is removed with its image.
fn resolve_links(document: &Document, base: &Url) {
    for link in document.select("a").iter() {
        if !has_text(&link) {
            link.remove();
        }
    }
    for link in document.select("a[href]").nodes() {
        let href = link.attr("href").unwrap_or_default();
        link.remove_attr("title");
        match absolute_url(base, &href) {
            Some(url) => link.set_attr("href", &url),
            None => link.remove_attr("href"),
        }
    }
}

/// An image is never written as an address. A standalone one with an alt text of at least
/// `MIN_IMAGE_ALT_CHARS` characters becomes the text `(Image: alt)`; any other image is dropped.
fn resolve_images(document: &Document) {
    for image in document.select("img").iter() {
        let alt = collapse_whitespace(&image.attr("alt").unwrap_or_default());
        if alt.chars().count() >= MIN_IMAGE_ALT_CHARS {
            image.replace_with_html(escape_html(&format!("(Image: {alt})")));
        } else {
            image.remove();
        }
    }
}

/// Removes the list items with no visible text (whitespace, or only an image that was dropped), so
/// no bare `-` line remains.
fn drop_empty_items(document: &Document) {
    for item in document.select("li").iter() {
        if !has_text(&item) {
            item.remove();
        }
    }
}

/// Whether an element holds any visible text: whitespace and hidden characters do not count.
fn has_text(element: &Selection) -> bool {
    element
        .text()
        .chars()
        .any(|ch| !ch.is_whitespace() && !is_hidden(ch))
}

/// The absolute http or https address of `reference`, resolved against `base`. `None` for an
/// empty reference, a fragment of this page, or any other scheme (javascript, mailto, data).
fn absolute_url(base: &Url, reference: &str) -> Option<String> {
    let reference = reference.trim();
    if reference.is_empty() || reference.starts_with('#') {
        return None;
    }
    let url = base.join(reference).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.into())
}

/// Zero-width characters and control characters, except the line break and the tab.
fn is_hidden(ch: char) -> bool {
    matches!(ch, '\u{200B}'..='\u{200D}' | '\u{2060}' | '\u{FEFF}')
        || (ch.is_control() && ch != '\n' && ch != '\t')
}

/// Drops the hidden characters and the trailing spaces of each line, keeps at most
/// `MAX_BLANK_LINES` blank lines in a row, and trims the ends.
fn tidy(markdown: &str) -> String {
    let mut out = String::with_capacity(markdown.len());
    let mut blank_run = 0;
    for raw_line in markdown.lines() {
        let visible: String = raw_line.chars().filter(|&ch| !is_hidden(ch)).collect();
        let line = visible.trim_end();
        if line.is_empty() {
            blank_run += 1;
            if blank_run > MAX_BLANK_LINES {
                continue;
            }
        } else {
            blank_run = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://example.com/docs/guide/index.html").expect("base")
    }

    fn markdown(html: &str) -> String {
        page_markdown(html, &base()).unwrap_or_default()
    }

    /// An article with a navigation bar, a cookie banner and a footer around its text.
    const ARTICLE: &str = r#"<!DOCTYPE html><html><head><title>River Tides - Science Daily</title>
        <style>.x { color: red }</style><script>var analytics = 1;</script></head>
        <body>
        <nav><ul><li><a href="/">Home</a></li><li><a href="/news">News</a></li><li><a href="/about">About</a></li></ul></nav>
        <div class="cookie-banner" id="cookie-consent">We use cookies on this site. <button>Accept cookies</button></div>
        <article>
        <h1>How tides shape the coast</h1>
        <p>Tides are the regular rise and fall of the sea, caused by the gravity of the Moon and the Sun acting on the oceans. Most coasts see two high tides and two low tides each day, although the timing shifts by about fifty minutes from one day to the next.</p>
        <p>Over long periods the rhythm of the tides carves estuaries, builds sandbars and moves sediment along the shore. Engineers study these cycles when they plan harbours, flood barriers and power stations that draw water from the sea.</p>
        </article>
        <footer><p>Copyright 2026 Science Daily. All rights reserved.</p></footer>
        </body></html>"#;

    /// An index page: a short list of links in the main column, no article.
    const INDEX_PAGE: &str = r#"<html><head><title>Guides</title></head><body>
        <nav><a href="/">Home</a></nav>
        <main><h2>Index of guides</h2>
        <ul><li><a href="install.html">Install the tool</a></li><li><a href="/docs/config">Configuration</a></li></ul>
        </main></body></html>"#;

    fn lines_of(markdown: &str) -> Vec<&str> {
        markdown.lines().collect()
    }

    /// `count` rows of a comparison table with short cells, about 20 characters of text each (about
    /// 2400 characters for 120 rows). Readability drops a table of short cells like this one.
    fn comparison_rows(count: usize) -> String {
        (1..=count)
            .map(|n| format!("<tr><td>Language {n}</td><td>Yes</td><td>Static</td></tr>"))
            .collect()
    }

    /// A page whose article is short and whose big data table sits outside it, as on a comparison
    /// page: Readability keeps the article and drops the table.
    fn table_heavy_page() -> String {
        let intro =
            "Comparison of languages, with notes on typing, memory, tooling, and ecosystems. "
                .repeat(4);
        let rows = comparison_rows(120);
        format!(
            r#"<html><head><title>Comparison</title></head><body>
            <article><h1>Comparison</h1><p>{intro}</p></article>
            <div class="comparison-data"><table>{rows}</table></div>
            </body></html>"#
        )
    }

    #[test]
    fn an_article_keeps_its_heading_and_text_and_drops_the_page_furniture() {
        let markdown = markdown(ARTICLE);
        assert!(
            markdown.contains("# How tides shape the coast"),
            "{markdown}"
        );
        assert!(markdown.contains("Tides are the regular rise and fall of the sea"));
        assert!(markdown.contains("Engineers study these cycles"));
        for furniture in [
            "Accept cookies",
            "We use cookies",
            "Copyright 2026",
            "Home",
            "About",
        ] {
            assert!(!markdown.contains(furniture), "{furniture} in {markdown}");
        }
    }

    #[test]
    fn a_normal_article_is_read_by_readability_not_the_whole_page() {
        let body = "Planets orbit the Sun, and each one keeps a path of its own through the sky. "
            .repeat(4);
        let html = format!(
            r#"<html><head><title>Planets</title></head><body>
            <nav><a href="/">Home</a></nav>
            <article><h1>Planets</h1><p>{body}</p>
            <table><tr><th>Planet</th><th>Diameter</th></tr><tr><td>Mars</td><td>6779 km</td></tr><tr><td>Venus</td><td>12104 km</td></tr></table>
            </article>
            <footer>Copyright 2026</footer></body></html>"#
        );
        let markdown = markdown(&html);
        assert!(
            markdown.starts_with("# Planets\n\nPlanets orbit"),
            "{markdown}"
        );
        assert!(markdown.contains("| Mars | 6779 km |"), "{markdown}");
        for furniture in ["Home", "Copyright"] {
            assert!(!markdown.contains(furniture), "{furniture} in {markdown}");
        }
    }

    #[test]
    fn a_table_heavy_page_keeps_its_table_rows_when_readability_drops_them() {
        let html = table_heavy_page();
        let base = base();
        let mut readability =
            Readability::new(html.as_str(), Some(base.as_str()), None).expect("readable");
        let article = readability.parse().expect("article");
        assert!(
            !article.content.contains("Language 120"),
            "the fixture no longer makes Readability drop the table"
        );
        let markdown = markdown(&html);
        assert!(markdown.contains("Comparison of languages"), "{markdown}");
        assert!(
            markdown.contains("| Language 1 | Yes | Static |"),
            "{markdown}"
        );
        assert!(
            markdown.contains("| Language 120 | Yes | Static |"),
            "{markdown}"
        );
    }

    #[test]
    fn table_text_decides_when_the_whole_page_is_converted() {
        let rows = comparison_rows(120);
        let text = Document::from("<main><p>Some prose in the main content.</p></main>");
        let page = Document::from(format!("<body><table>{rows}</table></body>"));
        assert!(tables_lost(&page, &text));
        let kept = Document::from(format!("<main><table>{rows}</table></main>"));
        assert!(!tables_lost(&page, &kept));
        let small = "<table><tr><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr></table>";
        assert!(!tables_lost(&Document::from(small), &text));
    }

    #[test]
    fn a_missing_table_is_appended_once_and_a_kept_one_is_not_repeated() {
        let kept = "<table><tr><td>k1</td></tr><tr><td>k2</td></tr><tr><td>k3</td></tr></table>";
        let lost = "<table><tr><td>l1</td></tr><tr><td>l2</td></tr><tr><td>l3</td></tr></table>";
        let main = Document::from(format!("<main><p>Prose.</p>{kept}</main>"));
        let page = Document::from(format!("<body><div>{kept}</div><div>{lost}</div></body>"));
        append_missing_tables(&main, &page);
        let markdown = body_markdown(main, &base()).expect("markdown");
        assert_eq!(markdown.matches("k1").count(), 1, "{markdown}");
        assert_eq!(markdown.matches("l3").count(), 1, "{markdown}");
        assert!(markdown.starts_with("Prose."), "{markdown}");
        assert_eq!(markdown.matches("## Tables").count(), 1, "{markdown}");
        assert!(
            markdown.contains("Tables from the page (placed after the article text)."),
            "{markdown}"
        );
    }

    #[test]
    fn a_site_name_is_cut_from_a_title_only_when_the_title_starts_with_it() {
        assert_eq!(
            without_site_name("GitHub - tauri-apps/tauri: Tauri is a framework · GitHub"),
            "GitHub - tauri-apps/tauri: Tauri is a framework"
        );
        assert_eq!(
            without_site_name("Rust (programming language) - Wikipedia"),
            "Rust (programming language) - Wikipedia"
        );
        assert_eq!(without_site_name("GitHub"), "GitHub");
    }

    #[test]
    fn a_title_loses_its_repeated_site_name() {
        let html = "<html><head><title>GitHub - a/b: A tool · GitHub</title></head><body><p>Text.</p></body></html>";
        assert_eq!(markdown(html), "# GitHub - a/b: A tool\n\nText.");
    }

    #[test]
    fn a_table_with_even_rows_becomes_a_pipe_table() {
        let html = r#"<html><body><main><table>
            <tr><th>Body</th><th>Diameter</th></tr>
            <tr><td>Moon</td><td>3474 km</td></tr>
            <tr><td>Mars</td><td>6779 km</td></tr>
            </table></main></body></html>"#;
        let markdown = markdown(html);
        assert!(markdown.contains("| Body | Diameter |"), "{markdown}");
        assert!(markdown.contains("| Moon | 3474 km |"), "{markdown}");
        assert!(markdown.contains("| Mars | 6779 km |"), "{markdown}");
    }

    #[test]
    fn an_irregular_table_becomes_one_line_per_row_and_keeps_its_links() {
        let html = r#"<main><table>
            <tr><td>Body</td><td>Note</td></tr>
            <tr><td>Moon</td><td>Orbits Earth</td></tr>
            <tr><td><a href="/sun">Sun</a></td><td>Star</td><td>extra</td></tr>
            </table></main>"#;
        let markdown = markdown(html);
        assert!(!markdown.contains("| - |"), "{markdown}");
        assert!(markdown.contains("Body; Note"), "{markdown}");
        assert!(markdown.contains("Moon; Orbits Earth"), "{markdown}");
        assert!(
            markdown.contains("[Sun](https://example.com/sun); Star; extra"),
            "{markdown}"
        );
    }

    #[test]
    fn a_table_that_is_too_wide_becomes_row_blocks() {
        let cells: String = (1..=7).map(|n| format!("<td>c{n}</td>")).collect();
        let html = format!("<main><table><tr>{cells}</tr><tr>{cells}</tr></table></main>");
        let markdown = markdown(&html);
        assert!(!markdown.contains("| - |"), "{markdown}");
        assert!(
            markdown.contains("c1; c2; c3; c4; c5; c6; c7"),
            "{markdown}"
        );
    }

    #[test]
    fn a_table_inside_a_table_becomes_row_blocks() {
        let html = "<main><table><tr><td>outer</td><td><table><tr><td>inner</td></tr></table></td></tr></table></main>";
        let markdown = markdown(html);
        assert!(!markdown.contains("| - |"), "{markdown}");
        assert!(markdown.contains("outer; inner"), "{markdown}");
    }

    #[test]
    fn a_code_block_is_fenced_with_its_language() {
        let html = r#"<main><pre><code class="language-rust">fn main() {
    println!("hi");
}</code></pre></main>"#;
        let markdown = markdown(html);
        assert!(markdown.contains("```rust\nfn main() {"), "{markdown}");
        assert!(
            markdown.contains("```\n") || markdown.ends_with("```"),
            "{markdown}"
        );
    }

    #[test]
    fn nested_lists_keep_their_levels() {
        let html = "<main><ul><li>first<ul><li>inner one</li><li>inner two</li></ul></li><li>second</li></ul><ol><li>step</li></ol></main>";
        let markdown = markdown(html);
        let lines = lines_of(&markdown);
        assert!(lines.contains(&"- first"), "{markdown}");
        assert!(
            lines.iter().any(|line| line.starts_with("    - inner one")),
            "{markdown}"
        );
        assert!(
            lines.iter().any(|line| line.starts_with("    - inner two")),
            "{markdown}"
        );
        assert!(lines.contains(&"- second"), "{markdown}");
        assert!(lines.iter().any(|line| line.contains("step")), "{markdown}");
    }

    #[test]
    fn empty_list_items_are_dropped_and_so_is_an_item_with_only_a_dropped_image() {
        let html = r#"<main><ul><li>one</li><li>   </li><li><img src="x.png" alt="ok"></li><li><a href="/e"><img src="y.png" alt="a long badge alt"></a></li><li>two</li></ul></main>"#;
        assert_eq!(markdown(html), "- one\n- two");
    }

    #[test]
    fn relative_and_absolute_links_are_absolute_and_odd_links_keep_only_their_text() {
        let html = r##"<main><p><a href="../api.html">relative</a> <a href="https://other.org/x">absolute</a>
            <a href="javascript:void(0)">script</a> <a href="mailto:me@example.com">mail</a>
            <a href="#top">top</a></p></main>"##;
        let markdown = markdown(html);
        assert!(
            markdown.contains("[relative](https://example.com/docs/api.html)"),
            "{markdown}"
        );
        assert!(
            markdown.contains("[absolute](https://other.org/x)"),
            "{markdown}"
        );
        for text in ["script", "mail", "top"] {
            assert!(markdown.contains(text), "{text} in {markdown}");
            assert!(
                !markdown.contains(&format!("[{text}](")),
                "{text} in {markdown}"
            );
        }
        assert!(!markdown.contains("javascript:"), "{markdown}");
        assert!(!markdown.contains("mailto:"), "{markdown}");
        assert!(!markdown.contains("](#"), "{markdown}");
    }

    #[test]
    fn an_escaped_ampersand_in_an_address_is_read_once_and_titles_are_dropped() {
        let short = r#"<main><p><a href="/q?a=1&amp;b=2" title="Tooltip">query</a></p></main>"#;
        assert_eq!(
            markdown(short),
            "[query](https://example.com/q?a=1&b=2)",
            "short page"
        );
        let long_text = "Some words that make the article long enough to count. ".repeat(5);
        let article = format!(
            r#"<html><body><article><h1>Long</h1><p>{long_text}</p>
            <p><a href="/q?a=1&amp;b=2" title="Tooltip">query</a> and more text here.</p>
            </article></body></html>"#
        );
        let markdown = markdown(&article);
        assert!(
            markdown.contains("[query](https://example.com/q?a=1&b=2)"),
            "{markdown}"
        );
        assert!(!markdown.contains("Tooltip"), "{markdown}");
    }

    #[test]
    fn address_entities_are_read_once_and_visible_text_is_kept() {
        assert_eq!(decode_address_entities("a&amp;quot;b&amp;c"), "a&quot;b&c");
        let markdown = "Shows &amp; in text: [x](https://a.org/?p=1&amp;q=2) and more";
        assert_eq!(
            unescape_addresses(markdown),
            "Shows &amp; in text: [x](https://a.org/?p=1&q=2) and more"
        );
        assert_eq!(
            unescape_addresses("[y](https://b.org/f_(1)) ok"),
            "[y](https://b.org/f_(1)) ok"
        );
    }

    #[test]
    fn a_standalone_image_with_a_long_alt_text_is_a_caption_and_no_address_is_written() {
        let html = r#"<main><p>Look <img src="https://cdn.example.com/a.png" alt="a chart of rain"> and <img src="b.png" alt="  "> and <img src="c.png" alt="logo"> here.</p></main>"#;
        let markdown = markdown(html);
        assert!(markdown.contains("(Image: a chart of rain)"), "{markdown}");
        assert!(!markdown.contains("logo"), "{markdown}");
        assert!(!markdown.contains("http"), "{markdown}");
        assert!(!markdown.contains(".png"), "{markdown}");
        assert!(!markdown.contains("!["), "{markdown}");
    }

    #[test]
    fn an_image_alt_text_with_markup_is_written_as_text() {
        let markdown =
            markdown(r#"<main><p><img src="a.png" alt="a <b>bold</b> chart"></p></main>"#);
        assert!(markdown.contains("(Image: a "), "{markdown}");
        assert!(markdown.contains("chart)"), "{markdown}");
    }

    #[test]
    fn a_badge_or_a_linked_picture_writes_nothing() {
        let html = r#"<main><p><a href="https://github.com/o/r/actions"><img src="https://camo.githubusercontent.com/3f2a9c" alt="Build status"></a> <a href="https://crates.io/crates/x"><img src="https://img.shields.io/crates/v/x.svg" alt="crates.io version"></a> Real text here.</p></main>"#;
        assert_eq!(markdown(html), "Real text here.");
    }

    #[test]
    fn edit_section_links_are_dropped() {
        let html = r#"<main><h2>History<span class="mw-editsection"><span class="mw-editsection-bracket">[</span><a href="/w/index.php?title=X&amp;action=edit&amp;section=1">edit</a><span class="mw-editsection-bracket">]</span></span></h2><p>Early text.</p><h2>Design<span class="editsection">[<a href="/w/index.php?action=edit&amp;section=2" title="Edit section">edit</a>]</span></h2><p>Later text.</p></main>"#;
        let markdown = markdown(html);
        assert!(!markdown.contains("edit"), "{markdown}");
        assert!(markdown.contains("Early text."), "{markdown}");
        assert!(markdown.contains("Later text."), "{markdown}");
        assert!(markdown.contains("History"), "{markdown}");
        assert!(markdown.contains("Design"), "{markdown}");
    }

    #[test]
    fn citation_markers_and_print_only_text_are_dropped() {
        let html = r##"<main><p>Rust is fast.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup> It is safe.<sup>[note 3]</sup> Done<sup>12</sup>.<span class="noprint"> (help)</span></p></main>"##;
        assert_eq!(markdown(html), "Rust is fast. It is safe. Done¹².");
    }

    #[test]
    fn an_exponent_superscript_keeps_its_digits() {
        let markdown =
            markdown("<main><p>Area is 5km<sup>2</sup>, and 10<sup>3</sup> items.</p></main>");
        assert_eq!(markdown, "Area is 5km², and 10³ items.");
    }

    #[test]
    fn a_reference_marker_is_dropped_by_its_class_or_its_fragment_link() {
        let html = r##"<main><p>Fast.<sup class="reference"><a href="#cite_note-1">[1]</a></sup> Safe.<sup><a href="#cite_note-2">2</a></sup> Done.</p></main>"##;
        assert_eq!(markdown(html), "Fast. Safe. Done.");
    }

    #[test]
    fn a_bare_bracketed_superscript_is_a_citation_and_is_dropped() {
        assert_eq!(
            markdown("<main><p>Text<sup>[12]</sup> more.</p></main>"),
            "Text more."
        );
    }

    #[test]
    fn images_of_a_page_without_an_article_follow_the_same_rule() {
        let html = r#"<html><body><nav><img src="/logo.png" alt="Site logo image"></nav><main><ul><li>Item</li><li><img src="/x.png" alt="Diagram of the pipeline"></li></ul></main></body></html>"#;
        let markdown = markdown(html);
        assert!(markdown.contains("- Item"), "{markdown}");
        assert!(
            markdown.contains("(Image: Diagram of the pipeline)"),
            "{markdown}"
        );
        assert!(!markdown.contains("Site logo"), "{markdown}");
    }

    #[test]
    fn a_page_without_an_article_falls_back_to_the_whole_body() {
        let markdown = markdown(INDEX_PAGE);
        assert!(markdown.contains("Index of guides"), "{markdown}");
        assert!(
            markdown.contains("[Install the tool](https://example.com/docs/guide/install.html)")
        );
        assert!(markdown.contains("[Configuration](https://example.com/docs/config)"));
        assert!(
            !markdown.contains("Home"),
            "the navigation is not kept: {markdown}"
        );
    }

    #[test]
    fn malformed_and_unclosed_html_does_not_panic() {
        let html = "<html><body><h1>Broken<p>text <b>bold <a href=x>link</i></h1>\
            <table><tr><td>one<td>two</table><<>> &amp &#xZZ; <script>var a = 1";
        let output = markdown(html);
        assert!(output.contains("Broken"), "{output}");
        assert!(output.contains("text"), "{output}");
        assert!(markdown("").is_empty());
    }

    #[test]
    fn a_title_starts_the_page_without_a_source_line() {
        let html = "<html><head><title>Guide &amp; more</title></head><body><p>Some text.</p></body></html>";
        let markdown = markdown(html);
        assert_eq!(markdown, "# Guide & more\n\nSome text.");
        assert!(!markdown.contains("Source:"), "{markdown}");
    }

    #[test]
    fn a_page_without_a_title_has_no_header() {
        assert_eq!(markdown("<p>Just text.</p>"), "Just text.");
    }

    #[test]
    fn hidden_characters_go_and_blank_runs_are_cut_to_two() {
        let input = "a\u{200B}b\u{7}c   \n\n\n\n\nd\u{FEFF}\r\n";
        assert_eq!(tidy(input), "abc\n\n\nd");
        assert_eq!(tidy("\n\n  x  \n"), "x");
    }

    #[test]
    fn a_script_only_page_has_no_markdown() {
        assert!(page_markdown("<script>var x = 1;</script>", &base()).is_none());
    }

    #[tokio::test]
    async fn a_script_only_page_gives_an_empty_text_for_the_no_text_message() {
        let text = html_page_text("<script>var x = 1;</script>".into(), base()).await;
        assert!(text.is_empty(), "{text}");
    }

    #[tokio::test]
    async fn a_two_mb_repetitive_page_converts_in_reasonable_time() {
        let paragraph =
            r#"<p>Lorem ipsum dolor sit amet, <a href="/x">consectetur</a> adipiscing elit.</p>"#;
        let mut html = String::from("<html><body><main>");
        while html.len() < 2 * 1024 * 1024 {
            html.push_str(paragraph);
        }
        html.push_str("</main></body></html>");
        let started = std::time::Instant::now();
        let text = html_page_text(html, base()).await;
        let elapsed = started.elapsed();
        assert!(text.contains("consectetur"));
        assert!(elapsed.as_secs() < 60, "took {elapsed:?}");
    }
}
