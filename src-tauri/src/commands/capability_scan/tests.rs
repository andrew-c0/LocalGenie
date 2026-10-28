//! Unit tests for the capability probes, reply classification and outcome text.

use super::*;

#[test]
fn every_key_has_a_probe_that_sends_a_value() {
    for key in CapabilityKey::ALL {
        let (field, value, _) = probe_for(*key);
        assert!(!field.is_empty(), "{} has no field", key.name());
        assert!(!value.is_null(), "{} has no value", key.name());
    }
    assert!(matches!(probe_for(CapabilityKey::Seed).2, Check::SameSeed));
    assert!(matches!(
        probe_for(CapabilityKey::MaxTokens).2,
        Check::OutputCut
    ));
}

#[test]
fn probe_body_is_short_and_keeps_the_load_params() {
    let load = ModelLoadParams {
        nctx: Some(4096),
        ..Default::default()
    };
    let body = request_body("org/model", &load, 0.0, &[("top_k", json!(5))]);
    assert_eq!(body["model"], "org/model");
    assert_eq!(body["stream"], false);
    assert_eq!(body["temperature"], 0.0);
    assert_eq!(body["max_tokens"], BASE_MAX_TOKENS);
    assert_eq!(body["top_k"], 5);
    assert_eq!(body["enable_think"], false);
    assert_eq!(
        body["nctx"], 4096,
        "load params keep the server from reloading"
    );
}

#[test]
fn probe_fields_replace_the_base_values() {
    let body = request_body(
        "m",
        &ModelLoadParams::default(),
        1.0,
        &[("max_tokens", json!(4))],
    );
    assert_eq!(body["max_tokens"], 4);
    assert_eq!(body["temperature"], 1.0);
    assert!(body.get("nctx").is_none(), "unset load params are not sent");
}

#[test]
fn success_needs_a_json_body() {
    assert!(matches!(
        classify(StatusCode::OK, r#"{"choices":[]}"#, &[]),
        Reply::Ok(_)
    ));
    assert!(matches!(
        classify(StatusCode::OK, "<html>", &[]),
        Reply::Inconclusive(_)
    ));
}

#[test]
fn a_bad_request_is_rejected_with_the_raw_text() {
    match classify(StatusCode::BAD_REQUEST, "  top_k must be positive  ", &[]) {
        Reply::Rejected(detail) => {
            assert!(detail.contains("top_k must be positive"));
            assert!(detail.starts_with("400"));
        }
        other => panic!("expected rejection, got {other:?}"),
    }
}

#[test]
fn an_error_that_names_the_value_is_rejected_even_with_a_5xx_status() {
    assert!(matches!(
        classify(StatusCode::INTERNAL_SERVER_ERROR, "invalid seed value", &[]),
        Reply::Rejected(_)
    ));
}

#[test]
fn timeouts_and_plain_server_failures_are_inconclusive() {
    assert!(matches!(
        classify(StatusCode::INTERNAL_SERVER_ERROR, "out of memory", &[]),
        Reply::Inconclusive(_)
    ));
    assert!(matches!(
        classify(StatusCode::REQUEST_TIMEOUT, "", &[]),
        Reply::Inconclusive(_)
    ));
    assert!(matches!(
        classify(StatusCode::TOO_MANY_REQUESTS, "busy", &[]),
        Reply::Inconclusive(_)
    ));
    assert!(matches!(
        classify(StatusCode::NOT_FOUND, "no route", &[]),
        Reply::Inconclusive(_)
    ));
}

#[test]
fn loaded_check_ignores_the_precision_suffix() {
    let loaded = vec!["org/model:Q4_K_M".to_owned()];
    assert!(is_loaded(&loaded, "org/model"));
    assert!(!is_loaded(&loaded, "org/other"));
    assert!(!is_loaded(&loaded, "org/mod"));
}

/// A chat reply whose message is `message`.
fn reply_with(message: Value) -> Value {
    reply_with_finish("stop", message)
}

/// A chat reply with `finish_reason` and `message`.
fn reply_with_finish(finish_reason: &str, message: Value) -> Value {
    json!({ "choices": [{ "finish_reason": finish_reason, "message": message }] })
}

/// One server-sent event carrying `content` as the delta.
fn sse(content: &str) -> String {
    format!(
        "data: {}\n\n",
        json!({ "choices": [{ "delta": { "content": content } }] })
    )
}

#[test]
fn thinking_probe_is_works_only_when_the_think_block_follows_the_switch() {
    let on = reply_with(json!({ "content": "<think>Counting.</think>1 2 3" }));
    let off = reply_with(json!({ "content": "1 2 3" }));
    assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);

    let on_by_field = reply_with(json!({ "content": "1 2 3", "reasoning_content": "Counting." }));
    assert_eq!(
        thinking_outcome(&on_by_field, &off).0,
        CapabilityStatus::Works
    );
}

#[test]
fn thinking_probe_is_works_when_only_the_closing_tag_shows() {
    // The template prefilled the opening tag, so the reply has `</think>` but no `<think>`.
    let on = reply_with(json!({ "content": "Counting...</think>1 2 3" }));
    let off = reply_with(json!({ "content": "1 2 3" }));
    assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
}

#[test]
fn thinking_probe_is_accepted_when_only_the_off_reply_has_a_closing_tag() {
    let on = reply_with(json!({ "content": "1 2 3" }));
    let off = reply_with(json!({ "content": "Counting...</think>1 2 3" }));
    assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Accepted);
}

#[test]
fn thinking_probe_is_accepted_when_no_think_block_shows_either_way() {
    let plain = reply_with(json!({ "content": "1 2 3" }));
    let (status, detail) = thinking_outcome(&plain, &plain);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert!(detail.contains("may not think"));
}

#[test]
fn thinking_probe_is_accepted_when_thinking_shows_with_the_switch_off() {
    let think = reply_with(json!({ "content": "<think>x</think>1" }));
    let plain = reply_with(json!({ "content": "1" }));
    assert_eq!(
        thinking_outcome(&plain, &think).0,
        CapabilityStatus::Accepted
    );
    assert_eq!(
        thinking_outcome(&think, &think).0,
        CapabilityStatus::Accepted
    );
}

#[test]
fn empty_reasoning_content_is_not_thinking() {
    let reply = reply_with(json!({ "content": "1", "reasoning_content": "  " }));
    assert!(!shows_thinking(&reply));
    assert!(!shows_thinking(&json!({})));
}

#[test]
fn tool_call_probe_counts_a_non_empty_tool_calls_array() {
    let called = reply_with(json!({
        "content": null,
        "tool_calls": [{ "type": "function", "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" } }]
    }));
    assert_eq!(tool_call_count(&called), 1);

    let empty = reply_with(json!({ "content": "It is sunny.", "tool_calls": [] }));
    assert_eq!(tool_call_count(&empty), 0);
    assert_eq!(tool_call_count(&json!({})), 0);
}

#[test]
fn a_400_that_names_the_thinking_field_is_rejected() {
    match classify(
        StatusCode::BAD_REQUEST,
        "enable_think is not a boolean",
        &["enable_think"],
    ) {
        Reply::Rejected(detail) => assert!(detail.starts_with("400")),
        other => panic!("expected rejection, got {other:?}"),
    }
}

#[test]
fn a_5xx_that_names_the_tools_field_is_rejected_only_for_that_probe() {
    assert!(matches!(
        classify(
            StatusCode::INTERNAL_SERVER_ERROR,
            "tools payload failed to parse",
            &["tools"],
        ),
        Reply::Rejected(_)
    ));
    assert!(matches!(
        classify(
            StatusCode::INTERNAL_SERVER_ERROR,
            "tools payload failed to parse",
            &[]
        ),
        Reply::Inconclusive(_)
    ));
}

#[test]
fn new_probes_send_their_own_fields() {
    let (field, value, check) = probe_for(CapabilityKey::Thinking);
    assert_eq!(field, "enable_think");
    assert_eq!(value, json!(true));
    assert!(matches!(check, Check::Thinking));

    let (field, value, check) = probe_for(CapabilityKey::ToolCalls);
    assert_eq!(field, "tools");
    assert_eq!(value[0]["function"]["name"], "get_weather");
    assert!(matches!(check, Check::ToolCalls));
}

#[test]
fn the_scan_runs_fourteen_keys_with_vision_and_audio_last() {
    assert_eq!(CapabilityKey::ALL.len(), 14);
    assert_eq!(CapabilityKey::ALL[12], CapabilityKey::Vision);
    assert_eq!(CapabilityKey::ALL.last(), Some(&CapabilityKey::Audio));
}

#[test]
fn thinking_probe_uses_the_thinking_prompt_for_both_requests() {
    let load = ModelLoadParams::default();
    let on = thinking_body("m", &load, true, false);
    let off = thinking_body("m", &load, false, false);
    for body in [&on, &off] {
        assert_eq!(body["messages"][0]["content"], THINKING_PROMPT);
        assert_eq!(body["messages"].as_array().map(Vec::len), Some(1));
        assert_eq!(body["temperature"], 0.0);
    }
    assert_eq!(THINKING_PROMPT, "Is 221 a prime number? Explain briefly.");
    assert_ne!(
        THINKING_PROMPT, PROMPT,
        "other probes keep the count prompt"
    );
}

#[test]
fn thinking_on_streams_with_the_cap_and_thinking_off_does_not() {
    let load = ModelLoadParams::default();
    let on = thinking_body("m", &load, true, false);
    assert_eq!(on["stream"], true);
    assert_eq!(on["enable_think"], true);
    assert_eq!(on["max_tokens"], 1024);

    let off = thinking_body("m", &load, false, false);
    assert_eq!(off["stream"], false);
    assert_eq!(off["enable_think"], false);
    assert_eq!(off["max_tokens"], THINK_MAX_TOKENS);
}

#[test]
fn the_thinking_probe_detail_names_the_cap_when_a_block_is_still_open() {
    let on = reply_with_finish(
        "length",
        json!({ "content": "<think>Two divisors, so 221 is" }),
    );
    let off = reply_with(json!({ "content": "No. 221 is 13 times 17." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Works);
    assert_eq!(
        detail,
        "The reply started a think block and did not finish within 1024 tokens."
    );
    assert!(!detail.contains("no think block"));
    assert!(!detail.contains("may not think"));
}

#[test]
fn a_gemma_style_block_open_at_the_cap_is_works() {
    let on = reply_with_finish(
        "length",
        json!({ "content": "<|channel>thought\nTwo divisors, so 221 is" }),
    );
    let off = reply_with(json!({ "content": "No. 221 is 13 times 17." }));
    assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
}

#[test]
fn a_prefilled_open_tag_past_the_cap_with_a_short_off_reply_is_works() {
    // Qwen-style: no tag in the reply with thinking on, which ran to the cap. Thinking off finished.
    let on = reply_with_finish("length", json!({ "content": "Two divisors, so 221 is" }));
    let off = reply_with_finish("stop", json!({ "content": "No." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Works);
    assert_eq!(
        detail,
        "The reply with thinking on ran past 1024 tokens, and the reply with thinking off finished. The switch changes the reply, but the closing tag was not seen."
    );
}

#[test]
fn a_prefilled_open_tag_is_accepted_when_both_replies_hit_the_cap() {
    let on = reply_with_finish("length", json!({ "content": "Two divisors, so 221 is" }));
    let off = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert!(detail.contains("may not think"));
}

#[test]
fn no_tag_and_both_replies_short_is_accepted() {
    let on = reply_with_finish("stop", json!({ "content": "No." }));
    let off = reply_with_finish("stop", json!({ "content": "No." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert!(detail.contains("may not think"));
}

#[test]
fn the_thinking_probe_is_works_when_the_block_closes_within_the_cap() {
    let on = reply_with_finish(
        "stop",
        json!({ "content": "<think>221 = 13 x 17.</think>No, 221 is not prime." }),
    );
    let off = reply_with(json!({ "content": "No, 221 is not prime." }));
    assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
}

#[test]
fn the_thinking_probe_is_works_when_the_block_is_open_but_the_reply_ended() {
    let on = reply_with_finish("stop", json!({ "content": "<think>Checking 221" }));
    let off = reply_with(json!({ "content": "No." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Works);
    assert!(detail.contains("ended before it closed"));
}

#[test]
fn the_thinking_probe_with_no_block_keeps_the_may_not_think_detail() {
    // Both replies hit the cap, so the switch's effect is not seen and the result stays accepted.
    let on = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
    let off = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
    let (status, detail) = thinking_outcome(&on, &off);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert!(detail.contains("may not think"));
    assert!(!detail.contains("did not finish"));
}

#[test]
fn thinking_seen_tells_closed_from_open() {
    let closed = reply_with(json!({ "content": "<think>x</think>1" }));
    let open = reply_with(json!({ "content": "<think>x" }));
    let none = reply_with(json!({ "content": "1" }));
    assert_eq!(thinking_seen(&closed), ThinkingSeen::Closed);
    assert_eq!(thinking_seen(&open), ThinkingSeen::Open);
    assert_eq!(thinking_seen(&none), ThinkingSeen::None);
}

#[test]
fn a_stream_stops_once_the_think_block_closes() {
    let mut streamed = StreamedReply::default();
    assert!(!streamed.push(sse("<think>Two divis").as_bytes()));
    // The closing tag arrives split across two network chunks.
    assert!(!streamed.push(sse("ors.</thi").as_bytes()));
    assert!(streamed.push(sse("nk>No, 221 is 13 x 17.").as_bytes()));
    let Reply::Ok(reply) = streamed.into_reply() else {
        panic!("expected a reply");
    };
    assert_eq!(
        thinking_outcome(&reply, &reply_with(json!({ "content": "No." }))).0,
        CapabilityStatus::Works
    );
    assert_eq!(
        content(&reply),
        Some("<think>Two divisors.</think>No, 221 is 13 x 17.")
    );
}

#[test]
fn a_stream_cut_at_the_cap_reads_as_thinking_started() {
    let mut streamed = StreamedReply::default();
    assert!(!streamed.push(sse("<think>Two divisors, so").as_bytes()));
    assert!(!streamed.push(b"data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"));
    assert!(!streamed.push(b"data: [DONE]\n\n"));
    let Reply::Ok(reply) = streamed.into_reply() else {
        panic!("expected a reply");
    };
    assert_eq!(reply["choices"][0]["finish_reason"], "length");
    let (status, detail) = thinking_outcome(&reply, &reply_with(json!({ "content": "No." })));
    assert_eq!(status, CapabilityStatus::Works);
    assert!(detail.contains("did not finish within 1024 tokens"));
}

#[tokio::test]
async fn a_stalled_stream_is_inconclusive_not_no_thinking() {
    let cancel = AtomicBool::new(false);
    let stalled = futures_util::stream::pending::<Result<Vec<u8>, String>>();
    let reply = read_chunks(&cancel, Box::pin(stalled), Duration::from_millis(50))
        .await
        .expect("not cancelled");
    match reply {
        Reply::Inconclusive(detail) => assert!(detail.starts_with("no data for"), "{detail}"),
        other => panic!("expected inconclusive, got {other:?}"),
    }
}

#[tokio::test]
async fn a_steady_stream_is_not_cut_by_the_chunk_wait() {
    // Three chunks, 80 ms apart: 240 ms in all, past the 200 ms wait. Each chunk arrives inside
    // the wait, so the reply is read through to the closing tag.
    use futures_util::StreamExt;

    let cancel = AtomicBool::new(false);
    let chunks = ["<think>Two", " divisors.", "</think>No."];
    let slow = futures_util::stream::iter(chunks).then(|text| async move {
        tokio::time::sleep(Duration::from_millis(80)).await;
        Ok::<Vec<u8>, String>(sse(text).into_bytes())
    });
    let reply = read_chunks(&cancel, Box::pin(slow), Duration::from_millis(200))
        .await
        .expect("not cancelled");
    let Reply::Ok(reply) = reply else {
        panic!("expected a reply");
    };
    assert_eq!(content(&reply), Some("<think>Two divisors.</think>No."));
}

#[test]
fn a_silent_wait_names_what_was_waited_for() {
    assert_eq!(
        silence_message(
            "no data",
            Duration::from_secs(CAPABILITY_PROBE_TIMEOUT_SECS)
        ),
        "no data for 60 s"
    );
    assert_eq!(
        silence_message("no response", Duration::from_secs(60)),
        "no response for 60 s"
    );
}

#[test]
fn a_stream_error_event_is_inconclusive_not_no_thinking() {
    let mut streamed = StreamedReply::default();
    assert!(streamed.push(b"data: {\"error\":\"context full\",\"code\":5}\n\n"));
    assert!(matches!(streamed.into_reply(), Reply::Inconclusive(_)));
}

#[test]
fn a_stream_that_is_one_json_body_is_read_as_a_reply() {
    let mut streamed = StreamedReply::default();
    assert!(!streamed.push(br#"{"choices":[{"message":{"content":"1 2 3"}}]}"#));
    let Reply::Ok(reply) = streamed.into_reply() else {
        panic!("expected a reply");
    };
    assert_eq!(content(&reply), Some("1 2 3"));
}

#[test]
fn grammar_probe_sends_the_yes_no_grammar_with_a_short_cap() {
    let (field, value, check) = probe_for(CapabilityKey::GrammarString);
    assert_eq!(field, "grammar_string");
    assert_eq!(value, json!("root ::= \"yes\" | \"no\""));
    assert!(matches!(check, Check::Grammar));
    assert_eq!(GRAMMAR_MAX_TOKENS, 8);
}

#[test]
fn grammar_probe_is_works_when_the_reply_is_yes_or_no() {
    let yes = reply_with(json!({ "content": "yes" }));
    assert_eq!(grammar_outcome(&yes).0, CapabilityStatus::Works);
    let no = reply_with(json!({ "content": " no\n" }));
    assert_eq!(grammar_outcome(&no).0, CapabilityStatus::Works);
}

#[test]
fn grammar_probe_is_accepted_when_a_200_reply_is_not_yes_or_no() {
    let other = reply_with(json!({ "content": "Yes, it is." }));
    let (status, detail) = grammar_outcome(&other);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert!(detail.contains("not yes or no"));
    assert_eq!(
        grammar_outcome(&reply_with(json!({ "content": null }))).0,
        CapabilityStatus::Accepted
    );
}

#[test]
fn grammar_probe_is_rejected_on_400_or_an_error_that_names_the_grammar() {
    let names = ["grammar_string", "grammar"];
    assert!(matches!(
        classify(StatusCode::BAD_REQUEST, "bad grammar", &names),
        Reply::Rejected(_)
    ));
    assert!(matches!(
        classify(
            StatusCode::INTERNAL_SERVER_ERROR,
            "grammar_string failed to parse",
            &names
        ),
        Reply::Rejected(_)
    ));
    assert!(matches!(
        classify(StatusCode::INTERNAL_SERVER_ERROR, "out of memory", &names),
        Reply::Inconclusive(_)
    ));
}

#[test]
fn a_tools_error_in_an_unrelated_sentence_is_not_a_rejection() {
    // "toolstack" is a different word, so this 5xx does not name the tools field.
    assert!(matches!(
        classify(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Toolstack rebuild failed while loading",
            &["tools"],
        ),
        Reply::Inconclusive(_)
    ));
}

#[test]
fn a_tools_error_that_names_the_field_is_a_rejection() {
    for text in [
        "tools: expected an array",
        "\"tools\" must be a list",
        "unknown field tools",
        "{\"error\": \"bad tools\"}",
    ] {
        assert!(
            matches!(
                classify(StatusCode::INTERNAL_SERVER_ERROR, text, &["tools"]),
                Reply::Rejected(_)
            ),
            "{text} names the tools field"
        );
    }
}

#[test]
fn a_400_is_a_rejection_whatever_the_text() {
    assert!(matches!(
        classify(
            StatusCode::BAD_REQUEST,
            "toolstack rebuild failed",
            &["tools"]
        ),
        Reply::Rejected(_)
    ));
}

#[test]
fn names_match_whole_words_only() {
    assert!(names_field("the tools field", "tools"));
    assert!(names_field("tools", "tools"));
    assert!(!names_field("toolset", "tools"));
    assert!(!names_field("my_tools_cache", "tools"));
    assert!(!names_field("tools2", "tools"));
    assert!(names_field("enable_think is not a boolean", "enable_think"));
    assert!(!names_field("enable_thinking", "enable_think"));
}

#[test]
fn reads_finish_reason_and_content_from_a_reply() {
    let reply = json!({"choices": [{"finish_reason": "length", "message": {"content": "1 2"}}]});
    assert_eq!(finish_reason(&reply), Some("length"));
    assert_eq!(content(&reply), Some("1 2"));
    assert_eq!(content(&json!({})), None);
}

const SHARED_CASES_JSON: &str = include_str!("../../../../shared/thinking-cases.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedSplit {
    pub(super) thinking: String,
    pub(super) answer: String,
    pub(super) thinking_open: bool,
}

#[derive(Deserialize)]
struct SharedCase {
    pub(super) name: String,
    pub(super) input: String,
    pub(super) expected: ExpectedSplit,
}

#[test]
fn shared_thinking_files_parse() {
    let patterns: ThinkingPatterns =
        serde_json::from_str(THINKING_PATTERNS_JSON).expect("shared/thinking-patterns.json parses");
    assert!(!patterns.patterns.is_empty());
    assert!(!patterns.strip_only.is_empty());
    let cases: Vec<SharedCase> =
        serde_json::from_str(SHARED_CASES_JSON).expect("shared/thinking-cases.json parses");
    assert!(!cases.is_empty());
}

#[test]
fn shared_cases_split_the_same_way_as_the_chat() {
    // The same file is checked by src/utils/thinking.test.ts.
    let cases: Vec<SharedCase> =
        serde_json::from_str(SHARED_CASES_JSON).expect("shared/thinking-cases.json parses");
    for case in cases {
        let parsed = parse_thinking(&case.input);
        assert_eq!(
            parsed.thinking, case.expected.thinking,
            "thinking: {}",
            case.name
        );
        assert_eq!(parsed.answer, case.expected.answer, "answer: {}", case.name);
        assert_eq!(
            parsed.thinking_open, case.expected.thinking_open,
            "thinkingOpen: {}",
            case.name
        );
    }
}

#[test]
fn gemma_and_harmony_reasoning_show_thinking() {
    let gemma = reply_with(json!({ "content": "<|channel>thought\nx<channel|>1" }));
    assert!(shows_thinking(&gemma));
    let harmony = reply_with(
        json!({ "content": "<|channel|>analysis<|message|>x<|end|><|channel|>final<|message|>1" }),
    );
    assert!(shows_thinking(&harmony));
}

#[test]
fn a_harmony_final_channel_alone_is_not_thinking() {
    let reply = reply_with(json!({ "content": "<|channel|>final<|message|>1 2 3<|return|>" }));
    assert!(!shows_thinking(&reply));
}

#[test]
fn an_empty_think_block_is_not_thinking() {
    let reply = reply_with(json!({ "content": "<think>  </think>1" }));
    assert!(!shows_thinking(&reply));
}

#[test]
fn the_probe_recipe_sends_nctx_4096_and_no_other_load_parameter() {
    let recipe = probe_recipe();
    assert_eq!(recipe.nctx, Some(4096));
    let mut body = json!({});
    apply_load_params(&mut body, &recipe);
    assert_eq!(body, json!({ "nctx": 4096 }));
}

#[test]
fn a_template_without_thinking_skips_the_thinking_probe_with_its_detail() {
    let hints = TemplateHints {
        thinking: Some(false),
        ..Default::default()
    };
    assert_eq!(
        template_skip(CapabilityKey::Thinking, hints).as_deref(),
        Some("The chat template shows no sign of thinking, so the probe was not run.")
    );
    assert_eq!(template_skip(CapabilityKey::ToolCalls, hints), None);
}

#[test]
fn a_template_without_tool_calls_skips_the_tool_probe() {
    let hints = TemplateHints {
        tool_calls: Some(false),
        ..Default::default()
    };
    assert_eq!(
        template_skip(CapabilityKey::ToolCalls, hints).as_deref(),
        Some("The chat template shows no sign of tool calls, so the probe was not run.")
    );
    assert_eq!(template_skip(CapabilityKey::Thinking, hints), None);
}

#[test]
fn an_unknown_or_positive_hint_runs_the_probe() {
    let unknown = TemplateHints::default();
    assert_eq!(template_skip(CapabilityKey::Thinking, unknown), None);
    assert_eq!(template_skip(CapabilityKey::ToolCalls, unknown), None);
    let positive = TemplateHints {
        thinking: Some(true),
        tool_calls: Some(true),
        vision: Some(true),
        audio: Some(true),
    };
    assert_eq!(template_skip(CapabilityKey::Thinking, positive), None);
    assert_eq!(template_skip(CapabilityKey::ToolCalls, positive), None);
    assert_eq!(template_skip(CapabilityKey::Seed, unknown), None);
}

/// A URL that refuses connections at once: a port that was just free.
fn refused_url() -> String {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(9);
    format!("http://127.0.0.1:{port}/v1/chat/completions")
}

/// Runs the probe for `key` against a refused URL with `hints`. A `Template` verdict means no request
/// was sent; a `NotRun` verdict means the probe sent its requests and got no answer.
async fn key_verdict(key: CapabilityKey, hints: TemplateHints) -> Verdict {
    let client = reqwest::Client::new();
    let cancel = AtomicBool::new(false);
    let session = Session {
        client: &client,
        url: refused_url(),
        model: "org/model".to_owned(),
        load: probe_recipe(),
        hints,
        cancel: &cancel,
    };
    probe_key(&session, key).await
}

#[tokio::test]
async fn a_template_without_thinking_skips_the_thinking_probe() {
    let hints = TemplateHints {
        thinking: Some(false),
        ..Default::default()
    };
    match key_verdict(CapabilityKey::Thinking, hints).await {
        Verdict::Template(detail) => assert_eq!(
            detail,
            "The chat template shows no sign of thinking, so the probe was not run."
        ),
        other => panic!("expected the template skip, got {other:?}"),
    }
}

#[tokio::test]
async fn an_unknown_thinking_hint_runs_the_probe() {
    match key_verdict(CapabilityKey::Thinking, TemplateHints::default()).await {
        Verdict::NotRun(_) => {}
        other => panic!("expected the probe to run and get no answer, got {other:?}"),
    }
}

#[test]
fn a_saved_reply_shows_thinking_when_a_block_opens_closes_or_only_closes() {
    assert!(text_shows_thinking("<think>x</think>1"));
    assert!(text_shows_thinking("<think>x"));
    assert!(text_shows_thinking("Counting...</think>1 2 3"));
    assert!(text_shows_thinking("<|channel>thought\nx<channel|>1"));
    assert!(!text_shows_thinking("1 2 3"));
    assert!(!text_shows_thinking("<think>  </think>1"));
    assert!(!text_shows_thinking(
        "<|channel|>final<|message|>1 2 3<|return|>"
    ));
}

#[test]
fn the_media_assets_are_bundled_and_have_their_formats() {
    assert!(!RED_PNG.is_empty());
    assert!(RED_PNG.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]));
    assert!(!ONE_TWO_THREE_WAV.is_empty());
    assert!(ONE_TWO_THREE_WAV.starts_with(b"RIFF"));
    assert_eq!(&ONE_TWO_THREE_WAV[8..12], b"WAVE");
}

#[test]
fn the_image_data_url_decodes_to_the_bundled_png() {
    let url = red_image_url();
    let encoded = url
        .strip_prefix("data:image/png;base64,")
        .expect("data URL prefix");
    let bytes = STANDARD.decode(encoded).expect("valid base64");
    assert_eq!(bytes, RED_PNG);
    assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G']));
}

#[test]
fn the_wav_base64_decodes_to_the_bundled_wav() {
    let decoded = STANDARD
        .decode(one_two_three_base64())
        .expect("valid base64");
    assert_eq!(decoded, ONE_TWO_THREE_WAV);
}

#[test]
fn vision_body_has_the_image_part_then_the_question() {
    let body = vision_body("org/model", &probe_recipe(), &json!(red_image_url()));
    assert_eq!(body["model"], "org/model");
    assert_eq!(body["stream"], false);
    assert_eq!(body["temperature"], 0.0);
    assert_eq!(body["max_tokens"], VISION_MAX_TOKENS);
    assert_eq!(body["enable_think"], false);
    assert_eq!(body["nctx"], 4096, "the recipe's load parameter");
    assert!(body.get("top_k").is_none(), "no other load parameter");

    let messages = body["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    let parts = messages[0]["content"].as_array().expect("content parts");
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[0]["type"], "image_url");
    let url = parts[0]["image_url"]["url"].as_str().expect("image url");
    assert!(url.starts_with("data:image/png;base64,"), "{url}");
    assert_eq!(parts[1]["type"], "text");
    assert_eq!(
        parts[1]["text"],
        "What colour is this image? Answer with one word."
    );
}

#[test]
fn audio_body_has_the_wav_part_then_the_question() {
    let body = audio_body("org/model", &probe_recipe(), &json!(one_two_three_base64()));
    assert_eq!(body["stream"], false);
    assert_eq!(body["temperature"], 0.0);
    assert_eq!(body["max_tokens"], AUDIO_MAX_TOKENS);
    assert_eq!(body["enable_think"], false);
    assert_eq!(body["nctx"], 4096, "the recipe's load parameter");

    let messages = body["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    let parts = messages[0]["content"].as_array().expect("content parts");
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[0]["type"], "input_audio");
    assert_eq!(parts[0]["input_audio"]["format"], "wav");
    let data = parts[0]["input_audio"]["data"].as_str().expect("data");
    assert!(!data.starts_with("data:"), "raw base64, no data URL prefix");
    assert_eq!(data, one_two_three_base64());
    assert_eq!(parts[1]["type"], "text");
    assert_eq!(
        parts[1]["text"],
        "What number words do you hear? Answer briefly."
    );
}

#[test]
fn vision_probe_works_when_the_reply_names_red() {
    for text in ["red", " Red\n", "It is RED."] {
        let reply = reply_with(json!({ "content": text }));
        let (status, detail) = vision_outcome(&reply);
        assert_eq!(status, CapabilityStatus::Works, "{text}");
        assert!(detail.contains("names red"), "{detail}");
    }
}

#[test]
fn has_word_matches_only_whole_words_ignoring_case() {
    assert!(has_word("Red.", "red"));
    assert!(has_word("red", "red"));
    assert!(has_word("It is red.", "red"));
    assert!(has_word("3", "3"));
    assert!(has_word("Three, two", "three"));
    assert!(!has_word("scared", "red"));
    assert!(!has_word("hundred", "red"));
    assert!(!has_word("13", "3"));
    assert!(!has_word("30", "3"));
    assert!(!has_word("thirteen", "three"));
}

#[test]
fn vision_probe_needs_red_as_a_whole_word() {
    for text in ["Red.", "red", "It is red."] {
        let (status, _) = vision_outcome(&reply_with(json!({ "content": text })));
        assert_eq!(status, CapabilityStatus::Works, "{text}");
    }
    for text in ["scared", "hundred"] {
        let (status, _) = vision_outcome(&reply_with(json!({ "content": text })));
        assert_eq!(status, CapabilityStatus::Accepted, "{text}");
    }
}

#[test]
fn audio_probe_needs_three_or_3_as_a_whole_word() {
    for text in ["Three.", "3", "Three, two"] {
        let (status, _) = audio_outcome(&reply_with(json!({ "content": text })));
        assert_eq!(status, CapabilityStatus::Works, "{text}");
    }
    for text in ["13", "30", "thirteen"] {
        let (status, _) = audio_outcome(&reply_with(json!({ "content": text })));
        assert_eq!(status, CapabilityStatus::Accepted, "{text}");
    }
}

#[test]
fn vision_probe_is_accepted_when_the_reply_does_not_name_red() {
    let reply = reply_with(json!({ "content": "Blue." }));
    let (status, detail) = vision_outcome(&reply);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert_eq!(
        detail,
        "HTTP 200. The reply does not name the colour, so the image was not seen."
    );
    assert_eq!(
        vision_outcome(&reply_with(json!({ "content": null }))).0,
        CapabilityStatus::Accepted
    );
}

#[test]
fn audio_probe_works_when_the_reply_names_three_or_3() {
    for text in ["three", "Three.", "3", "1, 2, 3"] {
        let reply = reply_with(json!({ "content": text }));
        let (status, detail) = audio_outcome(&reply);
        assert_eq!(status, CapabilityStatus::Works, "{text}");
        assert!(detail.contains("names three"), "{detail}");
    }
}

#[test]
fn audio_probe_is_accepted_when_neither_word_is_there() {
    let reply = reply_with(json!({ "content": "one, two." }));
    let (status, detail) = audio_outcome(&reply);
    assert_eq!(status, CapabilityStatus::Accepted);
    assert_eq!(
        detail,
        "HTTP 200. The reply does not name three, so the audio was not heard."
    );
    assert_eq!(
        audio_outcome(&reply_with(json!({ "content": null }))).0,
        CapabilityStatus::Accepted
    );
}

#[test]
fn a_400_or_422_on_the_media_probes_is_rejected_with_the_text() {
    let outcomes: [Outcome; 2] = [vision_outcome, audio_outcome];
    for status in [StatusCode::BAD_REQUEST, StatusCode::UNPROCESSABLE_ENTITY] {
        for outcome in outcomes {
            match verdict_for_reply(Some(classify(status, " no image part ", &[])), outcome) {
                Verdict::Status(CapabilityStatus::Rejected, detail) => {
                    assert!(detail.starts_with(&status.as_u16().to_string()), "{detail}");
                    assert!(detail.contains("no image part"), "{detail}");
                }
                other => panic!("expected rejection, got {other:?}"),
            }
        }
    }
}

#[test]
fn a_timeout_on_the_media_probes_is_not_run_and_a_200_maps_to_the_outcome() {
    let timeout = classify(StatusCode::REQUEST_TIMEOUT, "", &[]);
    assert!(matches!(
        verdict_for_reply(Some(timeout), vision_outcome),
        Verdict::NotRun(_)
    ));
    let ok = classify(
        StatusCode::OK,
        r#"{"choices":[{"message":{"content":"red"}}]}"#,
        &[],
    );
    assert!(matches!(
        verdict_for_reply(Some(ok), vision_outcome),
        Verdict::Status(CapabilityStatus::Works, _)
    ));
    assert!(matches!(
        verdict_for_reply(None, audio_outcome),
        Verdict::Cancelled
    ));
}

#[test]
fn the_vision_gate_skips_only_when_the_summary_has_no_projector() {
    let no_projector = TemplateHints {
        vision: Some(false),
        ..Default::default()
    };
    assert_eq!(
        template_skip(CapabilityKey::Vision, no_projector).as_deref(),
        Some("No vision projector in the model folder, so the probe was not run.")
    );
    let projector = TemplateHints {
        vision: Some(true),
        ..Default::default()
    };
    assert_eq!(template_skip(CapabilityKey::Vision, projector), None);
    assert_eq!(
        template_skip(CapabilityKey::Vision, TemplateHints::default()),
        None,
        "an unknown summary runs the probe"
    );
}

#[test]
fn the_audio_gate_runs_only_when_the_summary_has_an_audio_encoder() {
    for hint in [None, Some(false)] {
        let hints = TemplateHints {
            audio: hint,
            ..Default::default()
        };
        assert_eq!(
            template_skip(CapabilityKey::Audio, hints).as_deref(),
            Some("No audio encoder in the model file, so the probe was not run."),
            "{hint:?}"
        );
    }
    let encoder = TemplateHints {
        audio: Some(true),
        ..Default::default()
    };
    assert_eq!(template_skip(CapabilityKey::Audio, encoder), None);
}

#[test]
fn the_media_gates_leave_the_other_keys_alone() {
    let none = TemplateHints {
        vision: Some(false),
        audio: Some(false),
        ..Default::default()
    };
    assert_eq!(template_skip(CapabilityKey::Seed, none), None);
    assert_eq!(template_skip(CapabilityKey::GrammarString, none), None);
}

#[tokio::test]
async fn a_skipped_media_probe_is_a_template_verdict_with_no_request() {
    let no_projector = TemplateHints {
        vision: Some(false),
        ..Default::default()
    };
    match key_verdict(CapabilityKey::Vision, no_projector).await {
        Verdict::Template(detail) => assert_eq!(
            detail,
            "No vision projector in the model folder, so the probe was not run."
        ),
        other => panic!("expected the template skip, got {other:?}"),
    }
    match key_verdict(CapabilityKey::Audio, TemplateHints::default()).await {
        Verdict::Template(detail) => assert_eq!(
            detail,
            "No audio encoder in the model file, so the probe was not run."
        ),
        other => panic!("expected the template skip, got {other:?}"),
    }
}

#[tokio::test]
async fn a_media_probe_that_runs_and_gets_no_answer_is_not_run() {
    let with_media = TemplateHints {
        vision: Some(true),
        audio: Some(true),
        ..Default::default()
    };
    assert!(matches!(
        key_verdict(CapabilityKey::Vision, with_media).await,
        Verdict::NotRun(_)
    ));
    assert!(matches!(
        key_verdict(CapabilityKey::Audio, with_media).await,
        Verdict::NotRun(_)
    ));
}
