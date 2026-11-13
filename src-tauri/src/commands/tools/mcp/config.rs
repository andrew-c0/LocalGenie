//! The settings of one MCP server, as the form edits them and the database keeps them, and the
//! status the manager reports. `normalize` checks a server and clears the fields its transport
//! does not use.

use reqwest::header::{HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Longest server name the form accepts.
const NAME_MAX_CHARS: usize = 80;
/// Longest server id. A UUID is 36 characters.
const ID_MAX_CHARS: usize = 64;

/// How the app reaches a server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    /// A program the app starts and talks to over its stdin and stdout.
    Stdio,
    /// A streamable HTTP endpoint.
    Http,
}

impl McpTransport {
    /// The text the database keeps for this transport.
    pub fn as_str(self) -> &'static str {
        match self {
            McpTransport::Stdio => "stdio",
            McpTransport::Http => "http",
        }
    }

    /// The transport a database value names, or None for an unknown value.
    pub fn from_str_value(text: &str) -> Option<Self> {
        match text {
            "stdio" => Some(McpTransport::Stdio),
            "http" => Some(McpTransport::Http),
            _ => None,
        }
    }
}

/// One MCP server as the form edits it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    /// Empty when a new server is saved; the backend then makes an id.
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub transport: McpTransport,
    /// The program of a stdio server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// The working folder of a stdio server. None runs it in the app's folder. Ignored for HTTP.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// The endpoint of an HTTP server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    /// Connect when the app starts. Turning it on or off does not start or stop a running server.
    #[serde(default)]
    pub enabled: bool,
    /// The short name in the tool names (`mcp__<slug>__<tool>`). The backend picks it when the
    /// server is first saved and keeps it through renames. A value the form sends is ignored.
    #[serde(default)]
    pub slug: String,
}

impl McpServerConfig {
    /// Whether a change from `self` to `next` alters how the server is started: the transport, the
    /// program and its arguments, environment, folder, endpoint or headers. A rename, or a change of
    /// `enabled`, does not.
    pub fn connection_differs(&self, next: &McpServerConfig) -> bool {
        self.transport != next.transport
            || self.command != next.command
            || self.args != next.args
            || self.env != next.env
            || self.cwd != next.cwd
            || self.url != next.url
            || self.headers != next.headers
    }
}

/// Where a server is in its life.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    Stopped,
    Starting,
    Running,
    Failed,
}

/// A server with its status, as the UI lists it and as the status event carries it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub config: McpServerConfig,
    pub status: McpServerStatus,
    /// The readable reason the server failed, when it did.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Tools the server listed. Zero unless it is running.
    pub tool_count: usize,
}

impl McpServerInfo {
    /// The info of a server with no running state.
    pub fn stopped(config: McpServerConfig) -> Self {
        Self {
            config,
            status: McpServerStatus::Stopped,
            error: None,
            tool_count: 0,
        }
    }
}

/// Check a server the form sent and clear the fields its transport does not use. An empty id gets a
/// new UUID.
pub fn normalize(mut config: McpServerConfig) -> Result<McpServerConfig, String> {
    config.id = normalize_id(&config.id)?;
    config.name = normalize_name(&config.name)?;
    match config.transport {
        McpTransport::Stdio => {
            config.command = Some(normalize_command(config.command.as_deref())?);
            config.args = config
                .args
                .into_iter()
                .map(|arg| check_text(arg, "An argument"))
                .collect::<Result<_, _>>()?;
            config.env = normalize_pairs(config.env, "environment variable")?;
            config.cwd = normalize_cwd(config.cwd.as_deref())?;
            config.url = None;
            config.headers.clear();
        }
        McpTransport::Http => {
            config.url = Some(normalize_url(config.url.as_deref())?);
            config.headers = normalize_pairs(config.headers, "header")?;
            parse_headers(&config.headers)?;
            config.command = None;
            config.args.clear();
            config.env.clear();
            config.cwd = None;
        }
    }
    Ok(config)
}

/// Header names and values as HTTP accepts them.
pub fn parse_headers(
    headers: &BTreeMap<String, String>,
) -> Result<Vec<(HeaderName, HeaderValue)>, String> {
    headers
        .iter()
        .map(|(name, value)| {
            let parsed_name = HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| format!("The header name '{name}' is not valid."))?;
            let parsed_value = HeaderValue::from_str(value)
                .map_err(|_| format!("The value of header '{name}' is not valid."))?;
            Ok((parsed_name, parsed_value))
        })
        .collect()
}

fn normalize_id(id: &str) -> Result<String, String> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(uuid::Uuid::new_v4().to_string());
    }
    let allowed = id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !allowed || id.len() > ID_MAX_CHARS {
        return Err("The server id is not valid.".into());
    }
    Ok(id.to_string())
}

fn normalize_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Give the server a name.".into());
    }
    if name.chars().count() > NAME_MAX_CHARS {
        return Err(format!(
            "The name is longer than {NAME_MAX_CHARS} characters."
        ));
    }
    check_text(name.to_string(), "The name")
}

fn normalize_command(command: Option<&str>) -> Result<String, String> {
    let command = command.map(str::trim).unwrap_or_default();
    if command.is_empty() {
        return Err("Enter the command that starts the server.".into());
    }
    check_text(command.to_string(), "The command")
}

/// The working folder, trimmed. Blank means the app's folder (None). Whether it exists is checked
/// when the server starts, not when it is saved.
fn normalize_cwd(cwd: Option<&str>) -> Result<Option<String>, String> {
    match cwd.map(str::trim).filter(|folder| !folder.is_empty()) {
        Some(folder) => check_text(folder.to_string(), "The working folder").map(Some),
        None => Ok(None),
    }
}

fn normalize_url(url: Option<&str>) -> Result<String, String> {
    let url = url.map(str::trim).unwrap_or_default();
    let parsed = url::Url::parse(url)
        .map_err(|_| "Enter a web address that starts with http:// or https://.".to_string())?;
    let web_scheme = matches!(parsed.scheme(), "http" | "https");
    if !web_scheme || parsed.host_str().is_none() {
        return Err("Enter a web address that starts with http:// or https://.".into());
    }
    Ok(url.to_string())
}

/// Trim the keys and values of a map and refuse empty keys and characters a process cannot take.
fn normalize_pairs(
    pairs: BTreeMap<String, String>,
    what: &str,
) -> Result<BTreeMap<String, String>, String> {
    let mut cleaned = BTreeMap::new();
    for (key, value) in pairs {
        let key = key.trim().to_string();
        if key.is_empty() || key.contains('=') {
            return Err(format!("The {what} name '{key}' is not valid."));
        }
        check_text(key.clone(), &format!("The {what} name"))?;
        check_text(value.clone(), &format!("The {what} value"))?;
        cleaned.insert(key, value.trim().to_string());
    }
    Ok(cleaned)
}

/// Refuse text with a NUL character, which no program argument or header can hold.
fn check_text(text: String, what: &str) -> Result<String, String> {
    if text.contains('\0') {
        return Err(format!("{what} cannot contain a NUL character."));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stdio_config() -> McpServerConfig {
        McpServerConfig {
            id: "srv-1".into(),
            name: "  Docs  ".into(),
            transport: McpTransport::Stdio,
            command: Some(" npx ".into()),
            args: vec!["-y".into(), "server".into()],
            env: BTreeMap::from([("TOKEN".to_string(), "abc".to_string())]),
            cwd: Some(" C:/work ".into()),
            url: Some("https://ignored.example".into()),
            headers: BTreeMap::from([("X-Key".to_string(), "1".to_string())]),
            enabled: true,
            slug: "docs".into(),
        }
    }

    fn http_config(url: &str) -> McpServerConfig {
        McpServerConfig {
            id: String::new(),
            name: "Remote".into(),
            transport: McpTransport::Http,
            command: Some("ignored".into()),
            args: vec!["ignored".into()],
            env: BTreeMap::from([("IGNORED".to_string(), "x".to_string())]),
            cwd: Some("ignored".into()),
            url: Some(url.into()),
            headers: BTreeMap::from([("Authorization".to_string(), "Bearer t".to_string())]),
            enabled: false,
            slug: String::new(),
        }
    }

    #[test]
    fn a_stdio_working_folder_is_trimmed_and_a_blank_one_is_none() {
        let config = normalize(stdio_config()).expect("valid");
        assert_eq!(config.cwd.as_deref(), Some("C:/work"));

        let mut blank = stdio_config();
        blank.cwd = Some("   ".into());
        assert_eq!(normalize(blank).expect("valid").cwd, None);
    }

    #[test]
    fn an_http_server_has_no_working_folder() {
        let config = normalize(http_config("https://mcp.example")).expect("valid");
        assert_eq!(config.cwd, None);
    }

    #[test]
    fn a_rename_or_an_enabled_switch_is_not_a_connection_change() {
        let saved = normalize(stdio_config()).expect("valid");
        let renamed = McpServerConfig {
            name: "Other".into(),
            enabled: false,
            slug: "changed".into(),
            ..saved.clone()
        };
        assert!(!saved.connection_differs(&renamed));
    }

    #[test]
    fn each_connection_field_counts_as_a_change() {
        let saved = normalize(stdio_config()).expect("valid");
        let changes = [
            McpServerConfig {
                command: Some("node".into()),
                ..saved.clone()
            },
            McpServerConfig {
                args: vec!["other".into()],
                ..saved.clone()
            },
            McpServerConfig {
                env: BTreeMap::from([("TOKEN".to_string(), "new".to_string())]),
                ..saved.clone()
            },
            McpServerConfig {
                cwd: None,
                ..saved.clone()
            },
            McpServerConfig {
                transport: McpTransport::Http,
                ..saved.clone()
            },
        ];
        for changed in changes {
            assert!(saved.connection_differs(&changed), "{changed:?}");
        }
    }

    #[test]
    fn stdio_normalize_trims_and_clears_the_http_fields() {
        let config = normalize(stdio_config()).expect("valid");
        assert_eq!(config.name, "Docs");
        assert_eq!(config.command.as_deref(), Some("npx"));
        assert_eq!(config.url, None);
        assert!(config.headers.is_empty());
        assert_eq!(config.env.get("TOKEN").map(String::as_str), Some("abc"));
    }

    #[test]
    fn http_normalize_clears_the_stdio_fields_and_keeps_the_url() {
        let config = normalize(http_config("https://mcp.example/mcp")).expect("valid");
        assert_eq!(config.command, None);
        assert!(config.args.is_empty());
        assert!(config.env.is_empty());
        assert_eq!(config.url.as_deref(), Some("https://mcp.example/mcp"));
        assert_eq!(config.headers.len(), 1);
    }

    #[test]
    fn empty_id_gets_a_new_uuid() {
        let config = normalize(http_config("https://mcp.example")).expect("valid");
        assert_eq!(config.id.len(), 36);
        assert!(uuid::Uuid::parse_str(&config.id).is_ok());
    }

    #[test]
    fn a_web_address_must_be_http_or_https() {
        for url in ["ftp://mcp.example", "not a url", "https://"] {
            let error = normalize(http_config(url)).expect_err(url);
            assert_eq!(
                error,
                "Enter a web address that starts with http:// or https://."
            );
        }
    }

    #[test]
    fn a_bad_header_name_is_refused() {
        let mut config = http_config("https://mcp.example");
        config.headers = BTreeMap::from([("bad name".to_string(), "x".to_string())]);
        let error = normalize(config).expect_err("header");
        assert_eq!(error, "The header name 'bad name' is not valid.");
    }

    #[test]
    fn a_missing_name_or_command_is_refused() {
        let mut no_name = stdio_config();
        no_name.name = "   ".into();
        assert_eq!(
            normalize(no_name).expect_err("name"),
            "Give the server a name."
        );

        let mut no_command = stdio_config();
        no_command.command = Some(String::new());
        assert_eq!(
            normalize(no_command).expect_err("command"),
            "Enter the command that starts the server."
        );
    }

    #[test]
    fn an_id_with_unsafe_characters_is_refused() {
        let mut config = stdio_config();
        config.id = "../etc".into();
        assert_eq!(
            normalize(config).expect_err("id"),
            "The server id is not valid."
        );
    }

    #[test]
    fn info_serializes_in_camel_case_and_omits_an_empty_error() {
        let info = McpServerInfo::stopped(normalize(stdio_config()).expect("valid"));
        let json = serde_json::to_value(&info).expect("serialize");
        assert_eq!(json["status"], "stopped");
        assert_eq!(json["toolCount"], 0);
        assert!(json.get("error").is_none());
        assert_eq!(json["config"]["transport"], "stdio");
        assert!(json["config"].get("url").is_none());
    }

    #[test]
    fn a_config_without_optional_fields_deserializes() {
        let json = serde_json::json!({
            "name": "Plain",
            "transport": "stdio",
            "command": null
        });
        let config: McpServerConfig = serde_json::from_value(json).expect("deserialize");
        assert_eq!(config.command, None);
        assert_eq!(config.id, "");
        assert!(config.args.is_empty());
        assert!(!config.enabled);
    }
}
