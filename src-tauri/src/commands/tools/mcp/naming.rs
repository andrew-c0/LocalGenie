//! The names the model sees for MCP tools: `mcp__<server>__<tool>`. Each part uses only
//! `[a-zA-Z0-9_-]`, the whole name is at most 64 characters, and no two tools share a name. The
//! server part never contains `__`, so the first `__` after the prefix ends it.

use std::collections::HashSet;

/// Every MCP tool name starts with this.
pub const MCP_PREFIX: &str = "mcp__";
const SEPARATOR: &str = "__";
/// Longest tool name a model provider accepts.
const NAME_MAX_CHARS: usize = 64;
/// Longest server part, so the tool part keeps at least 33 characters.
const SLUG_MAX_CHARS: usize = 24;
const SLUG_FALLBACK: &str = "server";
const TOOL_FALLBACK: &str = "tool";

/// Whether a tool name belongs to an MCP server.
pub fn is_mcp_name(name: &str) -> bool {
    name.starts_with(MCP_PREFIX)
}

/// Hands out server parts and tool names that no other server or tool already has.
#[derive(Default)]
pub struct NameAllocator {
    slugs: HashSet<String>,
    names: HashSet<String>,
}

impl NameAllocator {
    /// A unique server part for a server called `server_name`.
    pub fn server_slug(&mut self, server_name: &str) -> String {
        let base = slug_text(&server_name.to_ascii_lowercase());
        let slug = first_free_part(&base, SLUG_MAX_CHARS, |candidate| {
            !self.slugs.contains(candidate)
        });
        self.slugs.insert(slug.clone());
        slug
    }

    /// The name of tool `tool_name` on the server with server part `slug`.
    pub fn tool_name(&mut self, slug: &str, tool_name: &str) -> String {
        let budget = NAME_MAX_CHARS - MCP_PREFIX.len() - slug.len() - SEPARATOR.len();
        let base = clean_part(tool_name, budget, TOOL_FALLBACK);
        let part = first_free_part(&base, budget, |candidate| {
            !self.names.contains(&full_name(slug, candidate))
        });
        let name = full_name(slug, &part);
        self.names.insert(name.clone());
        name
    }
}

fn full_name(slug: &str, part: &str) -> String {
    format!("{MCP_PREFIX}{slug}{SEPARATOR}{part}")
}

/// The server part: cleaned, with runs of underscores collapsed so it never holds `__`.
fn slug_text(text: &str) -> String {
    let mut collapsed = String::new();
    for c in clean_part(text, SLUG_MAX_CHARS, SLUG_FALLBACK).chars() {
        if c == '_' && collapsed.ends_with('_') {
            continue;
        }
        collapsed.push(c);
    }
    collapsed
}

/// `text` with every character outside `[a-zA-Z0-9_-]` replaced by `_`, the ends trimmed of `_`
/// and `-`, and at most `max` characters kept. Text that leaves nothing becomes `fallback`.
fn clean_part(text: &str, max: usize, fallback: &str) -> String {
    let replaced: String = text
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = replaced.trim_matches(|c| c == '_' || c == '-');
    let kept: String = trimmed.chars().take(max).collect();
    if kept.is_empty() {
        fallback.to_string()
    } else {
        kept
    }
}

/// `base` when `is_free` accepts it, else `base_2`, `base_3`... with `base` cut so the whole part
/// stays within `max` characters.
fn first_free_part(base: &str, max: usize, is_free: impl Fn(&str) -> bool) -> String {
    if is_free(base) {
        return base.to_string();
    }
    (2u32..)
        .map(|number| {
            let suffix = format!("_{number}");
            let head: String = base
                .chars()
                .take(max.saturating_sub(suffix.len()))
                .collect();
            format!("{head}{suffix}")
        })
        .find(|candidate| is_free(candidate))
        .unwrap_or_else(|| base.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_names_are_sanitised_and_lowercased() {
        let mut names = NameAllocator::default();
        assert_eq!(names.server_slug("My Server!"), "my_server");
        assert_eq!(names.server_slug("docs-tools"), "docs-tools");
        assert_eq!(names.server_slug("!!!"), "server");
        assert_eq!(names.server_slug("Server"), "server_2");
    }

    #[test]
    fn a_server_part_never_contains_a_double_underscore() {
        let mut names = NameAllocator::default();
        let slug = names.server_slug("a__b   c");
        assert_eq!(slug, "a_b_c");
        assert!(!slug.contains("__"));
        let slug = names.server_slug("x____y");
        assert!(!slug.contains("__"), "{slug}");
    }

    #[test]
    fn tool_names_are_sanitised_and_prefixed() {
        let mut names = NameAllocator::default();
        let slug = names.server_slug("docs");
        assert_eq!(names.tool_name(&slug, "read.file"), "mcp__docs__read_file");
        assert_eq!(
            names.tool_name(&slug, "list items"),
            "mcp__docs__list_items"
        );
    }

    #[test]
    fn a_long_name_is_kept_within_64_characters() {
        let mut names = NameAllocator::default();
        let slug = names.server_slug(&"s".repeat(100));
        assert_eq!(slug.len(), SLUG_MAX_CHARS);
        let name = names.tool_name(&slug, &"t".repeat(200));
        assert!(name.len() <= NAME_MAX_CHARS, "{} {name}", name.len());
        assert!(name.starts_with("mcp__"));
    }

    #[test]
    fn a_long_colliding_tool_name_still_fits() {
        let mut names = NameAllocator::default();
        let slug = names.server_slug("docs");
        let long = "t".repeat(200);
        let first = names.tool_name(&slug, &long);
        let second = names.tool_name(&slug, &long);
        assert_ne!(first, second);
        assert!(second.len() <= NAME_MAX_CHARS);
        assert!(second.ends_with("_2"));
    }

    #[test]
    fn servers_with_the_same_name_get_different_slugs() {
        let mut names = NameAllocator::default();
        assert_eq!(names.server_slug("Docs"), "docs");
        assert_eq!(names.server_slug("docs"), "docs_2");
        assert_eq!(names.server_slug("DOCS"), "docs_3");
    }

    #[test]
    fn tools_with_the_same_sanitised_name_get_different_names() {
        let mut names = NameAllocator::default();
        let slug = names.server_slug("docs");
        assert_eq!(names.tool_name(&slug, "a.b"), "mcp__docs__a_b");
        assert_eq!(names.tool_name(&slug, "a_b"), "mcp__docs__a_b_2");
        assert_eq!(names.tool_name(&slug, "a b"), "mcp__docs__a_b_3");
    }

    #[test]
    fn the_same_tool_name_on_two_servers_is_unique() {
        let mut names = NameAllocator::default();
        let first_slug = names.server_slug("alpha");
        let second_slug = names.server_slug("beta");
        let first = names.tool_name(&first_slug, "search");
        let second = names.tool_name(&second_slug, "search");
        assert_eq!(first, "mcp__alpha__search");
        assert_eq!(second, "mcp__beta__search");
    }

    #[test]
    fn only_mcp_prefixed_names_are_routed_to_servers() {
        assert!(is_mcp_name("mcp__docs__search"));
        assert!(!is_mcp_name("web_search"));
        assert!(!is_mcp_name("list_directory"));
    }
}
