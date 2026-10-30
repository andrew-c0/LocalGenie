//! Converts PaddleOCR-VL's table output to a markdown table. The model writes a table as tag text:
//! `<fcel>` starts a cell with text, `<lcel>` is a cell merged with the one to its left, `<ecel>` is
//! an empty cell (`<ucel>` and `<xcel>`, the other merge tags, are read the same way) and `<nl>`
//! ends a row. A merged cell becomes an empty one.

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
    let rows = parse_rows(raw);
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    if width == 0 {
        return raw.trim().to_string();
    }
    let mut lines = Vec::with_capacity(rows.len() + 1);
    for (index, row) in rows.iter().enumerate() {
        lines.push(markdown_row(row, width));
        if index == 0 {
            lines.push(format!("|{}", " --- |".repeat(width)));
        }
    }
    lines.join("\n")
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
}
