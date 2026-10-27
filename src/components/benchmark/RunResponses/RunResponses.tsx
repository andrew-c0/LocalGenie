import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Spinner,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { getBenchmarkRunSteps } from "../../../services/benchmark";
import type { BenchmarkRunStep, BenchmarkRunSummary } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { parseThinking } from "../../../utils/thinking";
import { ThinkingBlock } from "../../chat/ThinkingBlock/ThinkingBlock";
import { EditorDialog } from "../../ui/EditorDialog/EditorDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { MarkdownContent } from "../../ui/MarkdownContent/MarkdownContent";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import "./RunResponses.css";

/** The steps of one pass: a warm-up or a timed pass, in step order. */
interface Pass {
  key: string;
  label: string;
  steps: BenchmarkRunStep[];
}

/** Groups steps by pass, keeping the run's order: warm-up 1, then pass 1, and so on. */
function groupPasses(steps: BenchmarkRunStep[]): Pass[] {
  const passes = new Map<string, Pass>();
  for (const step of steps) {
    const key = `${step.isWarmup ? "warmup" : "pass"}-${step.repetitionIndex}`;
    const pass = passes.get(key) ?? {
      key,
      label: `${step.isWarmup ? "Warm-up" : "Pass"} ${step.repetitionIndex + 1}`,
      steps: [],
    };
    pass.steps.push(step);
    passes.set(key, pass);
  }
  return [...passes.values()];
}

/** The one-line facts under a step's name: outcome, time to first token, keyword result. */
function stepFacts(step: BenchmarkRunStep): string {
  const facts: string[] = [step.status];
  if (step.ttftMs !== null) facts.push(`TTFT ${step.ttftMs.toFixed(0)} ms`);
  if (step.passed !== null) facts.push(step.passed ? "keywords matched" : "keywords missed");
  return facts.join(" · ");
}

/** One step's reply, drawn as a chat message: reasoning in a thinking block, the answer as markdown. */
function StepReply({ step }: { step: BenchmarkRunStep }) {
  if (step.outputText === null) {
    return <Meta>{step.status === "skipped" ? "Skipped." : "No reply saved."}</Meta>;
  }
  const reply = parseThinking(step.outputText);
  return (
    <>
      {(reply.thinking || reply.thinkingOpen) && (
        <ThinkingBlock text={reply.thinking} live={false} />
      )}
      {reply.answer && <MarkdownContent>{reply.answer}</MarkdownContent>}
    </>
  );
}

/**
 * The passes of one run, each an accordion item holding its steps. A step shows its prompt, outcome
 * and reply, drawn as a chat message. Loads the steps when it mounts; read-only.
 */
export function RunPasses({ runId }: { runId: string }) {
  const [steps, setSteps] = useState<BenchmarkRunStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Passes that are open. The first pass starts open; the others start collapsed.
  const [openPasses, setOpenPasses] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getBenchmarkRunSteps(runId)
      .then((loaded) => {
        if (!cancelled) {
          setSteps(loaded);
          const first = groupPasses(loaded)[0];
          if (first) setOpenPasses([first.key]);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, "Could not load the run details."));
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) return <ErrorBanner message={error} />;
  if (steps === null) return <Spinner size="tiny" label="Loading run details" />;
  if (steps.length === 0) return <StateBlock message="This run has no steps." />;

  return (
    <Accordion
      multiple
      collapsible
      openItems={openPasses}
      onToggle={(_, data) => setOpenPasses(data.openItems as string[])}
    >
      {groupPasses(steps).map((pass) => {
        const failed = pass.steps.filter((s) => s.status === "failed").length;
        return (
          <AccordionItem key={pass.key} value={pass.key} className="run-responses__pass">
            <AccordionHeader>
              {pass.label}
              <Meta>
                {` · ${pass.steps.length} step${pass.steps.length === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} failed` : ""}`}
              </Meta>
            </AccordionHeader>
            <AccordionPanel>
              <ol className="run-responses__steps">
                {pass.steps.map((step) => (
                  <li key={step.id} className="run-responses__step">
                    <div className="run-responses__header">
                      <BodyStrong truncate>{step.promptName}</BodyStrong>
                      <Meta>{stepFacts(step)}</Meta>
                    </div>
                    {step.error && <ErrorBanner message={step.error} />}
                    <div className="run-responses__reply">
                      <StepReply step={step} />
                    </div>
                  </li>
                ))}
              </ol>
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

interface RunResponsesProps {
  run: BenchmarkRunSummary;
  onClose: () => void;
}

/**
 * Details of one run in a modal: its model, compute target, start time and outcome, then the passes
 * and replies from `RunPasses`. Read-only; closing it changes nothing.
 */
export function RunResponses({ run, onClose }: RunResponsesProps) {
  return (
    <EditorDialog title={`Run details · ${run.suiteName}`} dirty={false} onClose={onClose}>
      <Meta>
        {[
          run.modelName,
          run.compute.toUpperCase(),
          new Date(run.startedAt).toLocaleString(),
          run.status,
        ].join(" · ")}
      </Meta>
      <RunPasses runId={run.id} />
    </EditorDialog>
  );
}
