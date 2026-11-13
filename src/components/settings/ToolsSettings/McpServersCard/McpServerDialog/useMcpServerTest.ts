import { useState } from "react";
import { testMcpServer } from "../../../../../services/mcp";
import type { McpServerConfig, McpTestResult } from "../../../../../types";
import { errorMessage } from "../../../../../utils/errorMessage";
import {
  configFromDraft,
  type McpDraft,
  type McpTestRun,
  testResultFor,
} from "../../../../../utils/mcpServers";

/** What the Test button and its result need. Returned by `useMcpServerTest`. */
export interface McpServerTest {
  /** True while a test runs. */
  testing: boolean;
  /** The result for the form as it is now, or null when there is none or the form changed since. */
  result: McpTestResult | null;
  /** Runs a test with the form's current values. Saves nothing. */
  runTest: () => Promise<void>;
}

/** A call that failed before the backend answered becomes a failed result, so it is still shown. */
async function connectionTest(config: McpServerConfig): Promise<McpTestResult> {
  try {
    return await testMcpServer(config);
  } catch (err) {
    return { ok: false, error: errorMessage(err), tools: [] };
  }
}

/**
 * The connection test of the server form. The result belongs to the draft it ran with, so any edit
 * hides it. `saved` is the server being edited, or null for a new one.
 */
export function useMcpServerTest(draft: McpDraft, saved: McpServerConfig | null): McpServerTest {
  const [testing, setTesting] = useState(false);
  const [testRun, setTestRun] = useState<McpTestRun | null>(null);

  const runTest = async () => {
    const tested = draft;
    setTesting(true);
    const result = await connectionTest(configFromDraft(tested, saved));
    setTestRun({ draft: tested, result });
    setTesting(false);
  };

  return { testing, result: testResultFor(testRun, draft), runTest };
}
