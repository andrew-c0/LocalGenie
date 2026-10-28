fn main() {
    tauri_build::build();
    compile_aihub_protos();
}

/// Generates the AI Hub protobuf types into `OUT_DIR/qaihm.rs`.
///
/// `protox` parses the `.proto` files in pure Rust, so no `protoc` install is needed (Windows ARM64
/// has no prebuilt one here). `prost-build` then generates the Rust structs from the descriptors.
/// Sources live in `proto/`; see `commands/aihub.rs` for how they are used.
fn compile_aihub_protos() {
    println!("cargo:rerun-if-changed=proto");
    let files = ["manifest.proto", "release_assets.proto"];
    let descriptors = protox::compile(files, ["proto"])
        .unwrap_or_else(|e| panic!("AI Hub proto parse failed: {e}"));
    prost_build::Config::new()
        .compile_fds(descriptors)
        .unwrap_or_else(|e| panic!("AI Hub proto codegen failed: {e}"));
}
