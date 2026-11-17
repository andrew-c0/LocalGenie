/// Longest time one tool call may run before it returns "The tool timed out".
pub const TOOL_TIMEOUT_SECS: u64 = 10;

/// Most entries `list_directory` returns; the rest are counted in a final line.
pub const LIST_MAX_ENTRIES: usize = 200;

/// Largest file `read_text_file` will open.
pub const READ_MAX_BYTES: u64 = 1024 * 1024;

/// Largest image `read_image` will open. Bigger images are refused, not cut.
pub const IMAGE_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Most characters of tool output returned to the model when the caller sets no budget. Longer
/// output is cut and marked.
pub const CONTENT_MAX_CHARS: usize = 8000;

/// Smallest result budget a caller may ask for (`result_max_chars` of `tool_execute`).
pub const RESULT_MAX_CHARS_MIN: usize = 1000;

/// Largest result budget a caller may ask for (`result_max_chars` of `tool_execute`).
pub const RESULT_MAX_CHARS_MAX: usize = 40_000;

/// Longest time a `web_fetch` call may run: the robots check and the page, with redirects.
pub const WEB_FETCH_TIMEOUT_SECS: u64 = 45;

/// Longest time a `web_search` call may run. Each source has its own `SEARCH_TIMEOUT_SECS`.
pub const WEB_SEARCH_TIMEOUT_SECS: u64 = 60;

/// Longest time one call to an MCP server's tool may run.
pub const MCP_CALL_TIMEOUT_SECS: u64 = 60;

/// Timeout of one web request (a page hop, a robots.txt hop or a search request).
pub const WEB_REQUEST_TIMEOUT_SECS: u64 = 15;

/// Timeout of the whole robots.txt read for one origin.
pub const ROBOTS_TIMEOUT_SECS: u64 = 5;

/// Largest robots.txt body read. RFC 9309 asks crawlers to parse at least 500 KiB.
pub const ROBOTS_MAX_BYTES: usize = 512 * 1024;

/// Largest page body `web_fetch` reads. Longer bodies are cut and marked.
pub const FETCH_MAX_BYTES: usize = 2 * 1024 * 1024;

/// Largest response body read from one search source. A bigger answer is refused.
pub const SEARCH_MAX_BYTES: usize = 1024 * 1024;

/// Time one search source may take: request, body and parse.
pub const SEARCH_TIMEOUT_SECS: u64 = 10;

/// Shortest gap between two requests to the same search source.
pub const SEARCH_MIN_INTERVAL_MS: u64 = 1100;

/// Most redirects `web_fetch` and the robots.txt read follow, one validated hop at a time.
pub const MAX_REDIRECTS: usize = 5;

/// How long a robots.txt answer is reused for one origin.
pub const ROBOTS_CACHE_SECS: u64 = 600;

/// Most characters of a search result snippet shown to the model.
pub const SNIPPET_MAX_CHARS: usize = 300;

/// Most characters of a search query.
pub const QUERY_MAX_CHARS: usize = 200;

/// Bounds of the `limit` argument of `web_search`, and its default.
pub const SEARCH_LIMIT_MIN: usize = 1;
pub const SEARCH_LIMIT_MAX: usize = 10;
pub const SEARCH_LIMIT_DEFAULT: usize = 5;

/// DuckDuckGo (unofficial, no API key): shortest gap between two requests to it. The fallback page
/// waits for the same gap.
pub const DUCKDUCKGO_MIN_INTERVAL_MS: u64 = 5000;

/// Most requests to DuckDuckGo in one window, per app run. Each page request counts, so a search
/// that reads the fallback page counts twice. A cache hit counts for nothing.
pub const DUCKDUCKGO_WINDOW_LIMIT: usize = 20;

/// The window the request limit counts over: one hour.
pub const DUCKDUCKGO_WINDOW_SECS: u64 = 3600;

/// How long DuckDuckGo is left alone after it limits or challenges the app.
pub const DUCKDUCKGO_PAUSE_SECS: u64 = 900;

/// How long a stored answer is reused.
pub const DUCKDUCKGO_CACHE_TTL_SECS: u64 = 86_400;

/// Most queries kept in the answer cache. The oldest answer goes first.
pub const DUCKDUCKGO_CACHE_MAX_ENTRIES: usize = 100;

/// Results on one DuckDuckGo page; a stored answer keeps all of them.
pub const DUCKDUCKGO_PAGE_RESULTS: usize = 10;
