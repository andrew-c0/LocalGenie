//! Converts a model's table output to markdown tables. PaddleOCR-VL writes a table as tag text:
//! `<fcel>` starts a cell with text, `<lcel>` is a cell merged with the one to its left, `<ecel>` is
//! an empty cell (`<ucel>` and `<xcel>`, the other merge tags, are read the same way) and `<nl>`
//! ends a row. A merged cell becomes an empty one. GLM-OCR writes HTML `<table>` blocks, which
//! `html_tables_to_markdown` converts; the text around them is left alone.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tag {
    /// A cell that holds the text after the tag.
    Text,
    /// A cell with no text of its own.
    Empty,
    /// The end of a row.
    EndOfRow,
}

const TAGS: &[(&str, Tag)] = &[
    ("<fcel>", Tag::Text),
    ("<lcel>", Tag::Empty),
    ("<ecel>", Tag::Empty),
    ("<ucel>", Tag::Empty),
    ("<xcel>", Tag::Empty),
    ("<nl>", Tag::EndOfRow),
];

/// The first tag in `text`: where it starts, its length and its kind.
fn next_tag(text: &str) -> Option<(usize, usize, Tag)> {
    TAGS.iter()
        .filter_map(|(name, tag)| text.find(name).map(|start| (start, name.len(), *tag)))
        .min_by_key(|(start, _, _)| *start)
}

/// Split tag text into rows of cell text. Text before the first tag, and text after a cell that
/// cannot hold any, is dropped.
fn parse_rows(raw: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut in_text_cell = false;
    let mut rest = raw;
    while let Some((start, length, tag)) = next_tag(rest) {
        if in_text_cell {
            push_to_last(&mut row, &rest[..start]);
        }
        rest = &rest[start + length..];
        in_text_cell = tag == Tag::Text;
        match tag {
            Tag::Text | Tag::Empty => row.push(String::new()),
            Tag::EndOfRow => {
                if !row.is_empty() {
                    rows.push(std::mem::take(&mut row));
                }
            }
        }
    }
    if in_text_cell {
        push_to_last(&mut row, rest);
    }
    if !row.is_empty() {
        rows.push(row);
    }
    rows
}

fn push_to_last(row: &mut [String], text: &str) {
    if let Some(cell) = row.last_mut() {
        cell.push_str(text);
    }
}

/// One cell on a markdown row: white space collapsed to single spaces, `|` escaped.
fn cell_text(cell: &str) -> String {
    cell.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace('|', "\\|")
}

fn markdown_row(cells: &[String], width: usize) -> String {
    let mut line = String::from("|");
    for index in 0..width {
        let text = cells
            .get(index)
            .map(|cell| cell_text(cell))
            .unwrap_or_default();
        line.push_str(&format!(" {text} |"));
    }
    line
}

/// The model's table output as a markdown table whose first row is the header. Rows shorter than
/// the widest row are padded with empty cells. When the text holds no cell, it is returned as it
/// is, trimmed.
pub(super) fn table_to_markdown(raw: &str) -> String {
    markdown_table(&parse_rows(raw)).unwrap_or_else(|| raw.trim().to_string())
}

/// The rows as a markdown table: the first row is the header and a rule follows it. None when no
/// row has a cell.
fn markdown_table(rows: &[Vec<String>]) -> Option<String> {
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    if width == 0 {
        return None;
    }
    let mut lines = Vec::with_capacity(rows.len() + 1);
    for (index, row) in rows.iter().enumerate() {
        lines.push(markdown_row(row, width));
        if index == 0 {
            lines.push(format!("|{}", " --- |".repeat(width)));
        }
    }
    Some(lines.join("\n"))
}

/// The widest `colspan` or `rowspan` honoured. A larger value is read as this one.
const MAX_SPAN: usize = 32;

/// The entities decoded in table cells.
const ENTITIES: &[(&str, char)] = &[
    ("&amp;", '&'),
    ("&lt;", '<'),
    ("&gt;", '>'),
    ("&quot;", '"'),
    ("&#39;", '\''),
    ("&nbsp;", ' '),
];

/// Converts each `<table>` block in a model's reply to a markdown table, in place, with a blank line
/// before and after it. The text between tables is trimmed, and so is the whole. A table with no
/// closing tag, or with no cell text, is left as it is. A reply with no table is only trimmed.
pub(super) fn html_tables_to_markdown(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let mut blocks = Vec::new();
    let mut copied_to = 0;
    let mut search_from = 0;
    while let Some(start) = find_table_open(&lower, search_from) {
        let Some(open_end) = lower[start..].find('>').map(|at| start + at + 1) else {
            break;
        };
        let Some(close_start) = lower[open_end..].find("</table").map(|at| open_end + at) else {
            break;
        };
        let Some(close_end) = lower[close_start..]
            .find('>')
            .map(|at| close_start + at + 1)
        else {
            break;
        };
        search_from = close_end;
        if let Some(markdown) = html_table_block(&text[open_end..close_start]) {
            push_text(&mut blocks, &text[copied_to..start]);
            blocks.push(markdown);
            copied_to = close_end;
        }
    }
    push_text(&mut blocks, &text[copied_to..]);
    blocks.join("\n\n")
}

/// Keeps the trimmed text between tables, when any is left.
fn push_text(blocks: &mut Vec<String>, segment: &str) {
    let trimmed = segment.trim();
    if !trimmed.is_empty() {
        blocks.push(trimmed.to_string());
    }
}

/// The byte index of the next `<table` tag in `lower` at or after `from`. Tags such as `<tablet>`
/// are not tables.
fn find_table_open(lower: &str, from: usize) -> Option<usize> {
    let mut search_from = from;
    while let Some(offset) = lower[search_from..].find("<table") {
        let at = search_from + offset;
        let after = at + "<table".len();
        if !lower[after..].starts_with(|c: char| c.is_ascii_alphanumeric()) {
            return Some(at);
        }
        search_from = at + 1;
    }
    None
}

/// The markdown table for the inside of one `<table>`, or None when it holds no cell text.
fn html_table_block(inner: &str) -> Option<String> {
    let rows = parse_html_rows(inner);
    let has_text = rows.iter().flatten().any(|cell| !cell.trim().is_empty());
    if has_text {
        markdown_table(&rows)
    } else {
        None
    }
}

/// The rows of cell text inside a `<table>`. Only `<tr>`, `<td>`, `<th>` and `<br>` tags mean
/// something here: other tags are dropped, and so is text outside a cell. A `<` that does not start
/// a tag is text.
fn parse_html_rows(inner: &str) -> Vec<Vec<String>> {
    let mut rows = HtmlRows::default();
    let mut rest = inner;
    while let Some(open) = rest.find('<') {
        rows.text(&rest[..open]);
        rest = &rest[open..];
        if !rest[1..].starts_with(|c: char| c.is_ascii_alphabetic() || c == '/') {
            rows.text("<");
            rest = &rest[1..];
            continue;
        }
        let Some(close) = rest.find('>') else {
            break;
        };
        rows.tag(&rest[1..close]);
        rest = &rest[close + 1..];
    }
    rows.text(rest);
    rows.finish()
}

/// Builds the rows of one table from its tags and text, applying `colspan` and `rowspan`. A
/// `colspan` repeats the cell's text. A `rowspan` keeps the cell's text in its row and leaves empty
/// cells in the rows it covers.
#[derive(Default)]
struct HtmlRows {
    rows: Vec<Vec<String>>,
    /// The cells of the row being read.
    row: Vec<String>,
    /// Whether a row is open: one `<tr>` or cell has started and no `</tr>` has ended it.
    in_row: bool,
    /// For each column, how many more rows an earlier `rowspan` cell covers.
    covered: Vec<usize>,
    cell: Option<OpenCell>,
}

/// A cell whose end tag has not come yet.
struct OpenCell {
    text: String,
    colspan: usize,
    rowspan: usize,
}

impl HtmlRows {
    /// Adds text to the open cell. Text outside a cell is dropped.
    fn text(&mut self, text: &str) {
        if let Some(cell) = self.cell.as_mut() {
            cell.text.push_str(text);
        }
    }

    /// Reads one tag, given as the text between its `<` and `>`.
    fn tag(&mut self, tag: &str) {
        let (closing, body) = match tag.strip_prefix('/') {
            Some(body) => (true, body),
            None => (false, tag),
        };
        let name = body
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        match (name.as_str(), closing) {
            ("tr", false) => {
                self.end_row();
                self.in_row = true;
            }
            ("tr", true) => self.end_row(),
            ("td" | "th", false) => self.start_cell(
                span_attribute(body, "colspan"),
                span_attribute(body, "rowspan"),
            ),
            ("td" | "th", true) => self.end_cell(),
            ("br", _) => self.text(" "),
            _ => {}
        }
    }

    fn start_cell(&mut self, colspan: usize, rowspan: usize) {
        self.end_cell();
        self.in_row = true;
        self.cell = Some(OpenCell {
            text: String::new(),
            colspan,
            rowspan,
        });
    }

    fn end_cell(&mut self) {
        if let Some(cell) = self.cell.take() {
            let text = decode_entities(&cell.text);
            self.place(&text, cell.colspan, cell.rowspan);
        }
    }

    /// Adds the cell to the row, `colspan` columns wide. Columns a `rowspan` above covers get empty
    /// cells first.
    fn place(&mut self, text: &str, colspan: usize, rowspan: usize) {
        for _ in 0..colspan {
            while self.use_cover(self.row.len()) {
                self.row.push(String::new());
            }
            let column = self.row.len();
            self.row.push(text.to_string());
            if rowspan > 1 {
                self.cover(column, rowspan - 1);
            }
        }
    }

    /// Makes the rows below cover `column` for `rows` more rows.
    fn cover(&mut self, column: usize, rows: usize) {
        self.covered.resize(self.covered.len().max(column + 1), 0);
        if let Some(slot) = self.covered.get_mut(column) {
            *slot = rows;
        }
    }

    /// Uses one row of the cover on `column`, when there is one. True when the column is covered.
    fn use_cover(&mut self, column: usize) -> bool {
        match self.covered.get_mut(column) {
            Some(rows) if *rows > 0 => {
                *rows -= 1;
                true
            }
            _ => false,
        }
    }

    /// Closes the open cell and the open row. The columns a `rowspan` covers at the end of the row
    /// are filled, and a row with no cell is dropped.
    fn end_row(&mut self) {
        self.end_cell();
        if !self.in_row {
            return;
        }
        self.in_row = false;
        while self.row.len() < self.covered.len() {
            self.use_cover(self.row.len());
            self.row.push(String::new());
        }
        let row = std::mem::take(&mut self.row);
        if !row.is_empty() {
            self.rows.push(row);
        }
    }

    fn finish(mut self) -> Vec<Vec<String>> {
        self.end_row();
        self.rows
    }
}

/// Replaces the entities in `text` in one pass, so `&amp;lt;` reads as `&lt;`.
fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        match ENTITIES.iter().find(|(name, _)| rest.starts_with(name)) {
            Some((name, ch)) => {
                out.push(*ch);
                rest = &rest[name.len()..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// The `colspan` or `rowspan` attribute of a tag: 1 when it is absent or unreadable, at most
/// `MAX_SPAN`.
fn span_attribute(tag: &str, name: &str) -> usize {
    attribute_number(&tag.to_ascii_lowercase(), name)
        .unwrap_or(1)
        .clamp(1, MAX_SPAN)
}

/// The number that follows `name=` in a tag, quoted or not.
fn attribute_number(tag: &str, name: &str) -> Option<usize> {
    let after_name = &tag[tag.find(name)? + name.len()..];
    let value = after_name
        .trim_start()
        .strip_prefix('=')?
        .trim_start()
        .trim_start_matches(['"', '\'']);
    let digits: String = value.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    Some(digits.parse().unwrap_or(MAX_SPAN))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_table_becomes_markdown_with_a_header_rule() {
        let raw = "<fcel>Item<fcel>Qty<fcel>Price<nl><fcel>USB-C cable<fcel>2<fcel>9.50<nl>";
        assert_eq!(
            table_to_markdown(raw),
            "| Item | Qty | Price |\n| --- | --- | --- |\n| USB-C cable | 2 | 9.50 |"
        );
    }

    #[test]
    fn a_merged_cell_stays_empty() {
        let raw = "<fcel>Total<lcel><fcel>12<nl><fcel>a<fcel>b<fcel>c<nl>";
        assert_eq!(
            table_to_markdown(raw),
            "| Total |  | 12 |\n| --- | --- | --- |\n| a | b | c |"
        );
    }

    #[test]
    fn an_empty_cell_stays_empty() {
        let raw = "<fcel>A<ecel><fcel>C<nl><ecel><fcel>y<ecel><nl>";
        assert_eq!(
            table_to_markdown(raw),
            "| A |  | C |\n| --- | --- | --- |\n|  | y |  |"
        );
    }

    #[test]
    fn short_rows_are_padded_to_the_widest_row() {
        let raw = "<fcel>A<fcel>B<fcel>C<nl><fcel>1<nl>";
        assert_eq!(
            table_to_markdown(raw),
            "| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |"
        );
    }

    #[test]
    fn the_last_row_needs_no_end_tag() {
        assert_eq!(
            table_to_markdown("<fcel>A<fcel>B<nl><fcel>1<fcel>2"),
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        );
    }

    #[test]
    fn cell_text_is_trimmed_collapsed_and_pipes_are_escaped() {
        let raw = "<fcel>  two\n words <fcel>a|b<nl>";
        assert_eq!(
            table_to_markdown(raw),
            "| two words | a\\|b |\n| --- | --- |"
        );
    }

    #[test]
    fn a_single_row_still_gets_its_rule() {
        assert_eq!(table_to_markdown("<fcel>Only<nl>"), "| Only |\n| --- |");
    }

    #[test]
    fn text_without_tags_is_returned_as_it_is() {
        assert_eq!(table_to_markdown("  just some text \n"), "just some text");
        assert_eq!(table_to_markdown(""), "");
        assert_eq!(table_to_markdown("<nl><nl>"), "<nl><nl>".trim());
    }

    #[test]
    fn text_before_the_first_tag_is_dropped() {
        assert_eq!(
            table_to_markdown("Table:<fcel>A<fcel>B<nl>"),
            "| A | B |\n| --- | --- |"
        );
    }

    #[test]
    fn an_html_table_with_thead_and_tbody_becomes_markdown() {
        let html = "<table>\n<thead><tr><th>Item</th><th>Qty</th></tr></thead>\n\
                    <tbody><tr><td>Cable</td><td>2</td></tr></tbody>\n</table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| Item | Qty |\n| --- | --- |\n| Cable | 2 |"
        );
    }

    #[test]
    fn a_first_row_of_th_cells_is_the_header() {
        let html = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        );
    }

    #[test]
    fn a_colspan_repeats_the_cell_text() {
        let html = "<table><tr><th colspan=\"2\">Total</th><th>3</th></tr>\
                    <tr><td>a</td><td>b</td><td>c</td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| Total | Total | 3 |\n| --- | --- | --- |\n| a | b | c |"
        );
    }

    #[test]
    fn a_rowspan_leaves_empty_cells_in_the_rows_below() {
        let html = "<table><tr><td rowspan=\"2\">Group</td><td>a</td></tr>\
                    <tr><td>b</td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| Group | a |\n| --- | --- |\n|  | b |"
        );
    }

    #[test]
    fn a_huge_span_is_capped() {
        let html = "<table><tr><td colspan=\"99999999999999999999\">x</td></tr></table>";
        let markdown = html_tables_to_markdown(html);
        assert_eq!(markdown.matches('x').count(), MAX_SPAN, "{markdown}");
    }

    #[test]
    fn entities_are_decoded_once() {
        let html =
            "<table><tr><td>A &amp; B</td><td>&lt;x&gt; &quot;q&quot; it&#39;s&nbsp;ok</td></tr>\
                    <tr><td>&amp;lt;</td><td>1</td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| A & B | <x> \"q\" it's ok |\n| --- | --- |\n| &lt; | 1 |"
        );
    }

    #[test]
    fn br_is_a_space_and_other_tags_are_dropped() {
        let html = "<table><tr><td>line one<br>line two<br/>three</td>\
                    <td><b>bold</b> <span class=\"x\">t</span></td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| line one line two three | bold t |\n| --- | --- |"
        );
    }

    #[test]
    fn text_between_two_tables_is_kept() {
        let html = "Before\n<table><tr><td>A</td></tr></table>\nBetween text\n\
                    <table><tr><td>B</td></tr></table>\nAfter";
        assert_eq!(
            html_tables_to_markdown(html),
            "Before\n\n| A |\n| --- |\n\nBetween text\n\n| B |\n| --- |\n\nAfter"
        );
    }

    #[test]
    fn a_pipe_in_a_cell_is_escaped() {
        let html = "<table><tr><th>Code</th></tr><tr><td>a|b</td></tr></table>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| Code |\n| --- |\n| a\\|b |"
        );
    }

    #[test]
    fn a_markdown_reply_is_only_trimmed() {
        let markdown = "\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
        assert_eq!(
            html_tables_to_markdown(markdown),
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        );
    }

    #[test]
    fn a_plain_text_reply_is_only_trimmed() {
        assert_eq!(
            html_tables_to_markdown("  Total < 5\nLine two \n"),
            "Total < 5\nLine two"
        );
        assert_eq!(html_tables_to_markdown(" \n "), "");
    }

    #[test]
    fn an_unclosed_or_empty_table_is_left_as_it_is() {
        let unclosed = "Text\n<table><tr><td>A</td></tr>";
        assert_eq!(html_tables_to_markdown(unclosed), unclosed);
        assert_eq!(html_tables_to_markdown("<table>"), "<table>");
        assert_eq!(
            html_tables_to_markdown("<table></table>"),
            "<table></table>"
        );
        let no_text = "<table><tr><td></td></tr></table>";
        assert_eq!(html_tables_to_markdown(no_text), no_text);
    }

    #[test]
    fn tags_in_capitals_are_read_too() {
        let html = "<TABLE>\n<THEAD><TR><TH>Item</TH><TH Colspan=\"1\">Qty</TH></TR></THEAD>\n\
                    <TBODY><TR><TD>Cable</TD><TD>2</TD></TR></TBODY>\n</TABLE>";
        assert_eq!(
            html_tables_to_markdown(html),
            "| Item | Qty |\n| --- | --- |\n| Cable | 2 |"
        );
    }

    #[test]
    fn a_tag_that_only_starts_with_table_is_not_a_table() {
        assert_eq!(
            html_tables_to_markdown("<tablet>x</tablet>"),
            "<tablet>x</tablet>"
        );
    }
}
