import { describe, expect, it } from "vitest";
import { GENIEX_RUNTIME_ID, uninstallMessage } from "./runtimeSpecifics";

describe("uninstallMessage", () => {
  it("says the GenieX CLI locks Chat, Models and Benchmarks until it is installed again", () => {
    const message = uninstallMessage(GENIEX_RUNTIME_ID);
    expect(message).toContain("Chat, Models and Benchmarks stay locked");
  });

  it("names the Playground tabs each optional runtime locks", () => {
    expect(uninstallMessage("sd-cpp")).toContain(
      "Text to image, Image to image and Image upscaling",
    );
    expect(uninstallMessage("sherpa-onnx")).toContain("The Playground's Audio tab stays locked");
  });

  it("gives an unknown runtime the generic text only", () => {
    expect(uninstallMessage("other")).toBe(
      "The installed files are removed. You can install it again later.",
    );
  });
});
