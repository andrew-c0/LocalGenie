import { describe, expect, it } from "vitest";
import conf from "../../src-tauri/tauri.conf.json";

/** The sources one directive of the policy allows. */
function sourcesOf(directive: string): string[] {
  const csp = conf.app.security.csp;
  const found = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return found ? found.slice(1) : [];
}

describe("content security policy", () => {
  // The webview fetches the Hub directly (services/hubApi.ts). A blocked fetch throws the same
  // error as a dead connection, so the screens would read "You appear to be offline".
  it("lets the webview fetch from the Hugging Face Hub", () => {
    expect(sourcesOf("connect-src")).toContain("https://huggingface.co");
  });

  it("lets the webview reach the local GenieX server", () => {
    expect(sourcesOf("connect-src")).toContain("http://127.0.0.1:*");
  });
});
