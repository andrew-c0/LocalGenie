//! Native tools a chat model can call. `tool_list` gives the specs; `tool_execute` runs one call
//! from the model. Problems with a call (bad arguments, a path outside the allowed folders, an
//! unknown tool, a site that cannot be reached) come back as a readable `ok: false` result, not as
//! an error.

mod file_tools;
mod limits;
mod output;
mod paths;
mod spec;
#[cfg(test)]
mod test_support;
mod web;

use limits::{TOOL_TIMEOUT_SECS, WEB_FETCH_TIMEOUT_SECS, WEB_SEARCH_TIMEOUT_SECS};
use serde::Serialize;
use spec::{ToolSpec, LIST_DIRECTORY, READ_IMAGE, READ_TEXT_FILE, WEB_FETCH, WEB_SEARCH};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use web::search::SearchSourceInfo;

const TIMED_OUT: &str = "The tool timed out";
const PATH_REQUIRED: &str = "The argument 'path' is required and must be a string";

/// What a tool produced when it succeeded. A failure is an `Err` message the model can read.
#[derive(Debug, PartialEq, Eq)]
struct ToolOutput {
    content: String,
    truncated: bool,
    attachment: Option<ToolAttachment>,
}

/// A file the model should look at, such as an image. The frontend reads it from `path`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAttachment {
    /// Canonical path of the file, without the Windows `\\?\` prefix.
    pub path: String,
    pub name: String,
    pub mime: String,
}

/// The result of one tool call, as the frontend stores it and the model reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub ok: bool,
    pub content: String,
    pub truncated: bool,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment: Option<ToolAttachment>,
}

/// The native tools the model may be offered.
#[tauri::command]
pub async fn tool_list() -> Result<Vec<ToolSpec>, String> {
    Ok(spec::registry())
}

/// The public sources `web_search` can use, for the settings screen. No network call.
#[tauri::command]
pub async fn web_search_sources() -> Result<Vec<SearchSourceInfo>, String> {
    Ok(web::search::source_infos())
}

/// Run one tool call. `arguments` is the raw JSON string the model sent. `allowed_folders` are the
/// folders the user allowed for file tools. `enabled_search_sources` are the source ids the user
/// turned on for `web_search` (null or empty when none). Each call runs under its own time limit.
#[tauri::command]
pub async fn tool_execute(
    name: String,
    arguments: String,
    allowed_folders: Vec<String>,
    enabled_search_sources: Option<Vec<String>>,
) -> Result<ToolResult, String> {
    let started = Instant::now();
    let limit = Duration::from_secs(timeout_secs(&name));
    let timed_out = timed_out_message(&name);
    let enabled = enabled_search_sources.unwrap_or_default();
    let call = run_call(&name, &arguments, &allowed_folders, &enabled);
    let outcome = match tokio::time::timeout(limit, call).await {
        Err(_elapsed) => Err(timed_out),
        Ok(result) => result,
    };
    Ok(tool_result(outcome, started.elapsed()))
}

/// Turn a tool outcome into the result the model and the UI read.
fn tool_result(outcome: Result<ToolOutput, String>, elapsed: Duration) -> ToolResult {
    let duration_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);
    match outcome {
        Ok(output) => ToolResult {
            ok: true,
            content: output.content,
            truncated: output.truncated,
            duration_ms,
            attachment: output.attachment,
        },
        Err(message) => ToolResult {
            ok: false,
            content: message,
            truncated: false,
            duration_ms,
            attachment: None,
        },
    }
}

/// Route one call to its tool.
async fn run_call(
    name: &str,
    arguments: &str,
    allowed_folders: &[String],
    enabled_sources: &[String],
) -> Result<ToolOutput, String> {
    match name {
        LIST_DIRECTORY | READ_TEXT_FILE | READ_IMAGE => {
            run_file_call(name, arguments, allowed_folders).await
        }
        WEB_FETCH => web::fetch_tool(arguments).await,
        WEB_SEARCH => web::search_tool(arguments, enabled_sources).await,
        other => Err(unknown_tool(other)),
    }
}

/// Run a file tool on a blocking thread: its path checks and reads touch the disk.
async fn run_file_call(
    name: &str,
    arguments: &str,
    allowed_folders: &[String],
) -> Result<ToolOutput, String> {
    let (name, arguments, allowed) = (
        name.to_string(),
        arguments.to_string(),
        allowed_folders.to_vec(),
    );
    tokio::task::spawn_blocking(move || file_call(&name, &arguments, &allowed))
        .await
        .map_err(|error| format!("The tool could not run: {error}"))?
}

/// Run one file tool. Blocking file work: call from a blocking thread.
fn file_call(
    name: &str,
    arguments: &str,
    allowed_folders: &[String],
) -> Result<ToolOutput, String> {
    match name {
        LIST_DIRECTORY => list_call(arguments, allowed_folders),
        READ_TEXT_FILE => file_tools::read_text_file(&target_path(arguments, allowed_folders)?),
        READ_IMAGE => file_tools::read_image(&target_path(arguments, allowed_folders)?),
        other => Err(unknown_tool(other)),
    }
}

/// `list_directory`: the folder named by `path`, or the allowed folders when no path is given.
fn list_call(arguments: &str, allowed_folders: &[String]) -> Result<ToolOutput, String> {
    match path_argument(arguments)?.filter(|path| !path.is_empty()) {
        Some(path) => file_tools::list_directory(&paths::resolve_allowed(&path, allowed_folders)?),
        None => {
            let folders = paths::usable_folders(allowed_folders)?;
            Ok(file_tools::list_allowed_folders(&folders))
        }
    }
}

fn unknown_tool(name: &str) -> String {
    format!(
        "Unknown tool '{name}'. The tools are {LIST_DIRECTORY}, {READ_TEXT_FILE}, {READ_IMAGE}, {WEB_FETCH} and {WEB_SEARCH}."
    )
}

/// The time limit of a call: the web tools need longer than the file tools.
fn timeout_secs(name: &str) -> u64 {
    match name {
        WEB_FETCH => WEB_FETCH_TIMEOUT_SECS,
        WEB_SEARCH => WEB_SEARCH_TIMEOUT_SECS,
        _ => TOOL_TIMEOUT_SECS,
    }
}

/// The text of a call that ran out of time. A web call that is still waiting is reported as an
/// unreachable site, so the frontend shows it as offline rather than as a tool bug.
fn timed_out_message(name: &str) -> String {
    match name {
        WEB_FETCH | WEB_SEARCH => web::timeout_text(),
        _ => TIMED_OUT.into(),
    }
}

/// The `path` argument of a call, resolved inside the allowed folders.
fn target_path(arguments: &str, allowed_folders: &[String]) -> Result<PathBuf, String> {
    let path = path_argument(arguments)?.ok_or_else(|| PATH_REQUIRED.to_string())?;
    paths::resolve_allowed(&path, allowed_folders)
}

/// The `path` argument as text: `None` when it is left out. A non-string value is an error.
fn path_argument(arguments: &str) -> Result<Option<String>, String> {
    let args = parse_arguments(arguments)?;
    match args.get("path") {
        None => Ok(None),
        Some(serde_json::Value::String(path)) => Ok(Some(path.clone())),
        Some(_) => Err(PATH_REQUIRED.to_string()),
    }
}

/// Parse the model's arguments. Empty arguments count as an empty object.
fn parse_arguments(arguments: &str) -> Result<serde_json::Value, String> {
    if arguments.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(arguments).map_err(|e| format!("The arguments are not valid JSON: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{tool_execute, tool_list, tool_result, ToolAttachment, ToolOutput, ToolResult};
    use crate::commands::tools::paths::display_path;
    use crate::commands::tools::test_support::TempTree;
    use std::time::Duration;

    /// A PNG header with padding, enough for `read_image` to accept the file.
    const PNG_BYTES: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    async fn execute(name: &str, arguments: &str, allowed: Vec<String>) -> ToolResult {
        tool_execute(name.into(), arguments.into(), allowed, None)
            .await
            .expect("tool_execute returns Ok for tool-level problems")
    }

    async fn execute_with_sources(arguments: &str, enabled: &[&str]) -> ToolResult {
        let sources = enabled.iter().map(|id| (*id).to_string()).collect();
        tool_execute(
            "web_search".into(),
            arguments.into(),
            vec![],
            Some(sources),
        )
        .await
        .expect("tool_execute returns Ok for tool-level problems")
    }

    #[tokio::test]
    async fn tool_list_returns_the_file_tools_then_the_web_tools() {
        let specs = tool_list().await.expect("list");
        let names: Vec<&str> = specs.iter().map(|spec| spec.name.as_str()).collect();
        assert_eq!(
            names,
            ["list_directory", "read_text_file", "read_image", "web_fetch", "web_search"]
        );
    }

    #[tokio::test]
    async fn web_search_sources_lists_the_five_sources_in_camel_case() {
        let sources = super::web_search_sources().await.expect("sources");
        let ids: Vec<&str> = sources.iter().map(|source| source.id.as_str()).collect();
        assert_eq!(ids, ["wikipedia", "hackernews", "stackoverflow", "npm", "crates"]);
        let json = serde_json::to_value(&sources[1]).expect("serialize");
        assert_eq!(json["label"], "Hacker News");
        assert_eq!(json["host"], "hn.algolia.com");
        assert!(json["description"].is_string());
    }

    #[tokio::test]
    async fn invalid_json_arguments_are_a_readable_failure() {
        let result = execute("read_text_file", "{not json", vec![]).await;
        assert!(!result.ok);
        assert!(result
            .content
            .starts_with("The arguments are not valid JSON"));
    }

    #[tokio::test]
    async fn non_string_path_is_a_readable_failure() {
        let tree = TempTree::new("exec-args");
        let allowed = vec![tree.path().to_string_lossy().into_owned()];

        let numeric = execute("list_directory", "{\"path\": 3}", allowed.clone()).await;
        assert!(!numeric.ok);
        assert!(numeric.content.contains("'path' is required"));

        let null = execute("read_image", "{\"path\": null}", allowed).await;
        assert!(!null.ok);
        assert!(null.content.contains("'path' is required"));
    }

    #[tokio::test]
    async fn read_tools_without_a_path_say_it_is_required() {
        let tree = TempTree::new("exec-missing");
        let allowed = vec![tree.path().to_string_lossy().into_owned()];
        for name in ["read_text_file", "read_image"] {
            let result = execute(name, "{}", allowed.clone()).await;
            assert!(!result.ok, "{name}");
            assert!(result.content.contains("'path' is required"), "{name}");
        }
    }

    #[tokio::test]
    async fn list_without_a_path_shows_the_allowed_folders() {
        let tree = TempTree::new("exec-list-allowed");
        let root = tree.folder("docs");
        let allowed = vec![root.to_string_lossy().into_owned()];
        let canonical = std::fs::canonicalize(&root).expect("canonical");
        let expected = format!("folder  {}", display_path(&canonical));

        for arguments in ["{}", "", "{\"path\": \"\"}"] {
            let result = execute("list_directory", arguments, allowed.clone()).await;
            assert!(result.ok, "{arguments}: {}", result.content);
            assert_eq!(
                result.content,
                format!("These are the folders you may read.\n{expected}")
            );
            assert!(!result.truncated);
        }
    }

    #[tokio::test]
    async fn list_without_a_path_and_no_allowed_folder_is_a_readable_failure() {
        let result = execute("list_directory", "{}", vec![]).await;
        assert!(!result.ok);
        assert_eq!(result.content, "No folders are allowed for file tools");
    }

    #[tokio::test]
    async fn empty_arguments_list_the_allowed_folders_when_none_is_missing() {
        let result = execute("list_directory", "   ", vec![]).await;
        assert!(!result.ok);
        assert_eq!(result.content, "No folders are allowed for file tools");
    }

    #[tokio::test]
    async fn unknown_tool_is_a_readable_failure_that_names_the_tools() {
        let result = execute("delete_everything", "{}", vec![]).await;
        assert!(!result.ok);
        assert_eq!(
            result.content,
            "Unknown tool 'delete_everything'. The tools are list_directory, read_text_file, read_image, web_fetch and web_search."
        );
    }

    #[tokio::test]
    async fn read_image_returns_the_image_as_an_attachment() {
        let tree = TempTree::new("exec-image");
        let file = tree.file("photo.png", PNG_BYTES);
        let canonical = std::fs::canonicalize(&file).expect("canonical");
        let arguments = serde_json::json!({ "path": canonical }).to_string();
        let result = execute(
            "read_image",
            &arguments,
            vec![tree.path().to_string_lossy().into_owned()],
        )
        .await;
        assert!(result.ok, "{}", result.content);
        assert_eq!(
            result.content,
            "Image photo.png, image/png, 12 B. It is attached below."
        );
        assert_eq!(
            result.attachment,
            Some(ToolAttachment {
                path: display_path(&canonical),
                name: "photo.png".into(),
                mime: "image/png".into(),
            })
        );
    }

    #[tokio::test]
    async fn read_image_outside_the_allowed_folders_names_them() {
        let tree = TempTree::new("exec-image-outside");
        let root = tree.folder("root");
        let file = tree.file("other/photo.png", PNG_BYTES);
        let allowed = root.to_string_lossy().into_owned();
        let arguments = serde_json::json!({ "path": file }).to_string();
        let result = execute("read_image", &arguments, vec![allowed.clone()]).await;
        assert!(!result.ok);
        assert_eq!(
            result.content,
            format!("The path is outside the folders the user allowed. Allowed folders: {allowed}")
        );
        assert!(result.attachment.is_none());
    }

    #[tokio::test]
    async fn empty_allow_list_is_a_readable_failure() {
        let tree = TempTree::new("exec-empty");
        let file = tree.file("notes.txt", b"hi");
        let arguments = serde_json::json!({ "path": file }).to_string();
        let result = execute("read_text_file", &arguments, vec![]).await;
        assert!(!result.ok);
        assert_eq!(result.content, "No folders are allowed for file tools");
    }

    #[tokio::test]
    async fn path_outside_the_allowed_folders_is_a_readable_failure() {
        let tree = TempTree::new("exec-outside");
        let root = tree.folder("root");
        let file = tree.file("other/secret.txt", b"nope");
        let arguments = serde_json::json!({ "path": file }).to_string();
        let result = execute(
            "read_text_file",
            &arguments,
            vec![root.to_string_lossy().into_owned()],
        )
        .await;
        assert!(!result.ok);
        assert!(result.content.contains("outside the folders"));
    }

    #[tokio::test]
    async fn a_valid_call_returns_the_listing() {
        let tree = TempTree::new("exec-ok");
        tree.file("notes.txt", b"hi");
        let arguments = serde_json::json!({ "path": tree.path() }).to_string();
        let result = execute(
            "list_directory",
            &arguments,
            vec![tree.path().to_string_lossy().into_owned()],
        )
        .await;
        assert!(result.ok, "{}", result.content);
        assert_eq!(
            result.content,
            "Contains 0 folders and 1 file.\nfile  notes.txt  2 B"
        );
        assert!(!result.truncated);
    }

    #[tokio::test]
    async fn web_fetch_refuses_a_private_address_without_a_request() {
        let result = execute("web_fetch", r#"{"url":"http://127.0.0.1:9/"}"#, vec![]).await;
        assert!(!result.ok);
        assert_eq!(result.content, "This address is not a public web address.");
    }

    #[tokio::test]
    async fn web_fetch_without_a_url_is_a_readable_failure() {
        let result = execute("web_fetch", "{}", vec![]).await;
        assert!(!result.ok);
        assert!(result.content.contains("'url' is required"));
    }

    #[tokio::test]
    async fn web_search_with_no_enabled_source_says_so() {
        let result = execute_with_sources(r#"{"query":"rust"}"#, &[]).await;
        assert!(!result.ok);
        assert_eq!(
            result.content,
            "No search source is turned on in Settings > Tools."
        );
    }

    #[tokio::test]
    async fn web_search_names_the_enabled_sources_when_a_disabled_one_is_asked_for() {
        let result = execute_with_sources(
            r#"{"query":"rust","source":"npm"}"#,
            &["wikipedia", "hackernews"],
        )
        .await;
        assert!(!result.ok);
        assert_eq!(
            result.content,
            "The source 'npm' is not turned on. Turned on: wikipedia, hackernews."
        );
    }

    #[test]
    fn web_tools_time_out_as_an_unreachable_site() {
        assert!(super::timed_out_message("web_fetch").starts_with("Could not reach the web:"));
        assert!(super::timed_out_message("web_search").starts_with("Could not reach the web:"));
        assert_eq!(super::timed_out_message("list_directory"), super::TIMED_OUT);
        assert_eq!(super::timeout_secs("web_search"), 60);
        assert_eq!(super::timeout_secs("read_text_file"), 10);
    }

    #[test]
    fn tool_result_serializes_with_camel_case_keys() {
        let result = tool_result(
            Ok(ToolOutput {
                content: "text".into(),
                truncated: true,
                attachment: None,
            }),
            Duration::from_millis(42),
        );
        let json = serde_json::to_value(&result).expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "ok": true,
                "content": "text",
                "truncated": true,
                "durationMs": 42
            })
        );
    }

    #[test]
    fn tool_result_with_an_attachment_serializes_it_in_camel_case() {
        let attachment = ToolAttachment {
            path: "C:\\pics\\a.png".into(),
            name: "a.png".into(),
            mime: "image/png".into(),
        };
        let result = tool_result(
            Ok(ToolOutput {
                content: "Image a.png".into(),
                truncated: false,
                attachment: Some(attachment),
            }),
            Duration::from_millis(1),
        );
        let json = serde_json::to_value(&result).expect("serialize");
        assert_eq!(
            json["attachment"],
            serde_json::json!({ "path": "C:\\pics\\a.png", "name": "a.png", "mime": "image/png" })
        );
    }

    #[test]
    fn failed_outcome_has_no_attachment() {
        let result = tool_result(Err("nope".into()), Duration::from_millis(1));
        let json = serde_json::to_value(&result).expect("serialize");
        assert!(json.get("attachment").is_none());
    }

    #[test]
    fn failed_outcome_is_ok_false_with_the_message() {
        let result = tool_result(Err(super::TIMED_OUT.into()), Duration::from_millis(10_000));
        assert!(!result.ok);
        assert_eq!(result.content, "The tool timed out");
        assert!(!result.truncated);
        assert_eq!(result.duration_ms, 10_000);
    }
}
