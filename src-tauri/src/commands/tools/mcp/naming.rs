//! The names the model sees for MCP tools: `mcp__<slug>__<tool>`. Each part uses only
//! `[a-zA-Z0-9_-]`, the whole name is at most 64 characters, and no two tools share a name. The
//! slug is chosen once, when a server is saved, and never changes; it never contains `__`, so the
//! first `__` after the prefix ends it.

use std::collections::HashSet;

/// Every MCP tool name starts with this.
pub const MCP_PREFIX: &str = "mcp__";
const SEPARATOR: &str = "__";
/// Longest tool name a model provider accepts.
const NAME_MAX_CHARS: usize = 64;
/// Longest slug, so the tool part keeps at least 33 characters.
const SLUG_MAX_CHARS: usize = 24;
const SLUG_FALLBACK: &str = "server";
const TOOL_FALLBACK: &str = "tool";

/// Whether a tool name belongs to an MCP server.
pub fn is_mcp_name(name: &str) -> bool {
    name.starts_with(MCP_PREFIX)
}

/// The slug for a new server called `server_name`, not already in `taken`. A taken slug gets
/// `_2`, `_3`... and its stem is cut so the slug stays within the limit.
pub fn new_server_slug(server_name: &str, taken: &HashSet<String>) -> String {
    let base = slug_text(&server_name.to_ascii_lowercase());
    first_free_part(&base, SLUG_MAX_CHARS, |candidate| {
        !taken.contains(candidate)
    })
}

/// The slugs of servers named `names`, given in creation order. Each server gets the slug a new
/// server with its name would get after the ones before it, so the backfill of existing rows
/// follows the same rule as a server saved now.
pub fn backfill_slugs<'a>(names: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut taken = HashSet::new();
    names
        .into_iter()
        .map(|name| {
            let slug = new_server_slug(name, &taken);
            taken.insert(slug.clone());
            slug
        })
        .collect()
}

/// Hands out tool names that no other tool of the running servers already has.
#[derive(Default)]
pub struct NameAllocator {
    names: HashSet<String>,
}

impl NameAllocator {
    /// The name of tool `tool_name` on the server with slug `slug`.
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

/// The slug text: cleaned, with runs of underscores collapsed so it never holds `__`.
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

    fn slug_of(server_name: &str) -> String {
        new_server_slug(server_name, &HashSet::new())
    }

    #[test]
    fn server_names_are_sanitised_and_lowercased() {
        assert_eq!(slug_of("My Server!"), "my_server");
        assert_eq!(slug_of("docs-tools"), "docs-tools");
        assert_eq!(slug_of("!!!"), "server");
    }

    #[test]
    fn a_slug_never_contains_a_double_underscore() {
        assert_eq!(slug_of("a__b   c"), "a_b_c");
        assert!(!slug_of("x____y").contains("__"));
    }

    #[test]
    fn a_taken_slug_gets_a_numeric_suffix() {
        let taken = HashSet::from(["server".to_string()]);
        assert_eq!(new_server_slug("Server", &taken), "server_2");
        let taken = HashSet::from(["docs".to_string(), "docs_2".to_string()]);
        assert_eq!(new_server_slug("Docs", &taken), "docs_3");
    }

    #[test]
    fn a_long_slug_with_a_suffix_stays_within_the_limit() {
        let long = "s".repeat(100);
        let taken = HashSet::from([slug_of(&long)]);
        let slug = new_server_slug(&long, &taken);
        assert_eq!(slug.len(), SLUG_MAX_CHARS);
        assert!(slug.ends_with("_2"));
    }

    #[test]
    fn backfill_follows_creation_order_and_the_collision_rule() {
        assert_eq!(
            backfill_slugs(["Docs", "docs", "DOCS", "Alpha"]),
            ["docs", "docs_2", "docs_3", "alpha"]
        );
    }

    #[test]
    fn backfill_of_no_servers_is_empty() {
        assert!(backfill_slugs(std::iter::empty()).is_empty());
    }

    #[test]
    fn a_later_server_with_a_taken_name_gets_the_suffix() {
        // The first server keeps `docs` for good; the second one, saved under the same name, gets
        // `docs_2`.
        let taken = HashSet::from([slug_of("Docs")]);
        assert_eq!(new_server_slug("Docs", &taken), "docs_2");
    }

    #[test]
    fn tool_names_are_sanitised_and_prefixed() {
        let mut names = NameAllocator::default();
        let slug = slug_of("docs");
        assert_eq!(names.tool_name(&slug, "read.file"), "mcp__docs__read_file");
        assert_eq!(
            names.tool_name(&slug, "list items"),
            "mcp__docs__list_items"
        );
    }

    #[test]
    fn a_long_name_is_kept_within_64_characters() {
        let mut names = NameAllocator::default();
        let slug = slug_of(&"s".repeat(100));
        assert_eq!(slug.len(), SLUG_MAX_CHARS);
        let name = names.tool_name(&slug, &"t".repeat(200));
        assert!(name.len() <= NAME_MAX_CHARS, "{} {name}", name.len());
        assert!(name.starts_with("mcp__"));
    }

    #[test]
    fn a_long_colliding_tool_name_still_fits() {
        let mut names = NameAllocator::default();
        let slug = slug_of("docs");
        let long = "t".repeat(200);
        let first = names.tool_name(&slug, &long);
        let second = names.tool_name(&slug, &long);
        assert_ne!(first, second);
        assert!(second.len() <= NAME_MAX_CHARS);
        assert!(second.ends_with("_2"));
    }

    #[test]
    fn tools_with_the_same_sanitised_name_get_different_names() {
        let mut names = NameAllocator::default();
        let slug = slug_of("docs");
        assert_eq!(names.tool_name(&slug, "a.b"), "mcp__docs__a_b");
        assert_eq!(names.tool_name(&slug, "a_b"), "mcp__docs__a_b_2");
        assert_eq!(names.tool_name(&slug, "a b"), "mcp__docs__a_b_3");
    }

    #[test]
    fn the_same_tool_name_on_two_servers_is_unique() {
        let mut names = NameAllocator::default();
        let first_slug = slug_of("alpha");
        let second_slug = slug_of("beta");
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
