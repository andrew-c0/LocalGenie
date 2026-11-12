//! The web tools. `web_fetch` reads one page or text file; `web_search` asks the public sources. This
//! module checks the arguments; the work is in `fetch` (pages) and `search` (sources), over the shared
//! client of `client` and the robots.txt cache of `robots`.
mod charset;
mod client;
mod fetch;
mod html_text;
mod robots;
pub(super) mod search;

use super::limits::{QUERY_MAX_CHARS, SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX, SEARCH_LIMIT_MIN};
use super::{parse_arguments, ToolOutput};
use serde_json::Value;

/// `web_fetch`: the page at the `url` argument, from the `start` character.
pub(super) async fn fetch_tool(arguments: &str) -> Result<ToolOutput, String> {
    let args = parse_arguments(arguments)?;
    let url = string_argument(&args, "url")?;
    let start = start_argument(&args)?;
    let client = client::web_client()?;
    fetch::fetch_page(&url, start, &client, &robots::ROBOTS_CACHE).await
}

/// `web_search`: the query on the enabled sources, or on the one `source` names.
pub(super) async fn search_tool(
    arguments: &str,
    enabled: &[String],
) -> Result<ToolOutput, String> {
    let args = parse_arguments(arguments)?;
    let query = query_argument(&args)?;
    let limit = limit_argument(&args)?;
    let source = optional_string_argument(&args, "source")?;
    let sources = search::plan(source.as_deref(), enabled)?;
    let client = client::web_client()?;
    let outcomes = search::search_all(&sources, |source| {
        search::query_source(&client, source, &query, limit)
    })
    .await;
    search::merged_output(&outcomes)
}

/// The text of a web call that ran out of time: an unreachable site, in the shared offline form.
pub(super) fn timeout_text() -> String {
    client::WebError::Unreachable("the request took too long".into()).message()
}

/// The `url` or `query` argument: required, a string.
fn string_argument(args: &Value, name: &str) -> Result<String, String> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("The argument '{name}' is required and must be a string"))
}

/// An optional string argument. Null and blank count as not given.
fn optional_string_argument(args: &Value, name: &str) -> Result<Option<String>, String> {
    match args.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .map(|text| Some(text.trim().to_string()).filter(|text| !text.is_empty()))
            .ok_or_else(|| format!("The argument '{name}' must be a string")),
    }
}

/// The `start` argument of `web_fetch`: a character offset, 0 when not given.
fn start_argument(args: &Value) -> Result<usize, String> {
    match args.get("start") {
        None | Some(Value::Null) => Ok(0),
        Some(value) => value
            .as_u64()
            .and_then(|number| usize::try_from(number).ok())
            .ok_or_else(|| "The argument 'start' must be a whole number, 0 or more.".into()),
    }
}

/// The `query` argument of `web_search`: trimmed, not empty, not too long.
fn query_argument(args: &Value) -> Result<String, String> {
    let query = string_argument(args, "query")?;
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("The argument 'query' is empty.".into());
    }
    if trimmed.chars().count() > QUERY_MAX_CHARS {
        return Err(format!(
            "The argument 'query' is too long. The limit is {QUERY_MAX_CHARS} characters."
        ));
    }
    Ok(trimmed.to_string())
}

/// The `limit` argument of `web_search`: a whole number from 1 to 10, 5 when not given.
fn limit_argument(args: &Value) -> Result<usize, String> {
    match args.get("limit") {
        None | Some(Value::Null) => Ok(SEARCH_LIMIT_DEFAULT),
        Some(value) => value
            .as_u64()
            .and_then(|number| usize::try_from(number).ok())
            .filter(|limit| (SEARCH_LIMIT_MIN..=SEARCH_LIMIT_MAX).contains(limit))
            .ok_or_else(|| {
                format!(
                    "The argument 'limit' must be a whole number from {SEARCH_LIMIT_MIN} to {SEARCH_LIMIT_MAX}."
                )
            }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn start_defaults_to_zero_and_must_be_a_whole_number() {
        assert_eq!(start_argument(&json!({})), Ok(0));
        assert_eq!(start_argument(&json!({ "start": null })), Ok(0));
        assert_eq!(start_argument(&json!({ "start": 7000 })), Ok(7000));
        for bad in [json!({ "start": -1 }), json!({ "start": "3" }), json!({ "start": 1.5 })] {
            let refusal = start_argument(&bad).expect_err("bad start");
            assert_eq!(refusal, "The argument 'start' must be a whole number, 0 or more.");
        }
    }

    #[test]
    fn url_and_query_are_required_strings() {
        let missing = string_argument(&json!({}), "url").expect_err("missing");
        assert_eq!(missing, "The argument 'url' is required and must be a string");
        assert!(string_argument(&json!({ "url": 3 }), "url").is_err());
        assert_eq!(
            string_argument(&json!({ "url": "https://a.example" }), "url").as_deref(),
            Ok("https://a.example")
        );
    }

    #[test]
    fn query_is_trimmed_and_checked_for_length() {
        assert_eq!(query_argument(&json!({ "query": "  rust  " })), Ok("rust".into()));
        assert_eq!(
            query_argument(&json!({ "query": "   " })).expect_err("blank"),
            "The argument 'query' is empty."
        );
        let long = "q".repeat(QUERY_MAX_CHARS + 1);
        assert!(query_argument(&json!({ "query": long }))
            .expect_err("long")
            .starts_with("The argument 'query' is too long"));
        let at_limit = "q".repeat(QUERY_MAX_CHARS);
        assert!(query_argument(&json!({ "query": at_limit })).is_ok());
    }

    #[test]
    fn limit_is_a_whole_number_from_one_to_ten_with_a_default_of_five() {
        assert_eq!(limit_argument(&json!({})), Ok(5));
        assert_eq!(limit_argument(&json!({ "limit": 1 })), Ok(1));
        assert_eq!(limit_argument(&json!({ "limit": 10 })), Ok(10));
        for bad in [json!({ "limit": 0 }), json!({ "limit": 11 }), json!({ "limit": "4" })] {
            let refusal = limit_argument(&bad).expect_err("bad limit");
            assert_eq!(
                refusal,
                "The argument 'limit' must be a whole number from 1 to 10."
            );
        }
    }

    #[test]
    fn a_blank_source_is_the_same_as_none_and_a_non_string_is_refused() {
        assert_eq!(optional_string_argument(&json!({}), "source"), Ok(None));
        assert_eq!(optional_string_argument(&json!({ "source": " " }), "source"), Ok(None));
        assert_eq!(
            optional_string_argument(&json!({ "source": " npm " }), "source"),
            Ok(Some("npm".into()))
        );
        assert_eq!(
            optional_string_argument(&json!({ "source": 4 }), "source"),
            Err("The argument 'source' must be a string".into())
        );
    }

    #[tokio::test]
    async fn fetch_tool_checks_its_arguments_before_any_request() {
        let missing = fetch_tool("{}").await.expect_err("missing url");
        assert!(missing.contains("'url' is required"));
        let negative = fetch_tool(r#"{"url":"https://example.com","start":-4}"#)
            .await
            .expect_err("negative start");
        assert!(negative.contains("'start'"));
        let refused = fetch_tool(r#"{"url":"http://169.254.169.254/"}"#)
            .await
            .expect_err("metadata address");
        assert_eq!(refused, client::NON_PUBLIC_ADDRESS);
    }

    #[tokio::test]
    async fn search_tool_refuses_when_no_source_is_on_or_the_named_one_is_off() {
        let none = search_tool(r#"{"query":"rust"}"#, &[]).await.expect_err("none on");
        assert_eq!(none, "No search source is turned on in Settings > Tools.");

        let off = search_tool(r#"{"query":"rust","source":"npm"}"#, &["wikipedia".into()])
            .await
            .expect_err("npm off");
        assert_eq!(off, "The source 'npm' is not turned on. Turned on: wikipedia.");

        let bad_limit = search_tool(r#"{"query":"rust","limit":50}"#, &["npm".into()])
            .await
            .expect_err("limit");
        assert!(bad_limit.contains("'limit'"));
    }
}
