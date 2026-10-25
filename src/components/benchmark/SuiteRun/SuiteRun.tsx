import { Button, ProgressBar } from "@fluentui/react-components";
import { PlayRegular, StopRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import * as db from "../../../services/database";
import * as geniex from "../../../services/geniex";
import { reloadModel, savedLoadParams } from "../../../services/modelLoad";
import { useModelStore } from "../../../stores/modelStore";
import type { BenchmarkProgressEvent, ComputeTarget } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { shortModelKey } from "../../../utils/modelKey";
import { toast } from "../../../utils/toast";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import { RunConsentDialog } from "./RunConsentDialog";
import { useSuiteRun } from "./useSuiteRun";
import "./SuiteRun.css";

const COMPUTE_LABELS: Record<ComputeTarget, string> = {
  npu: "NPU",
  gpu: "GPU",
  cpu: "CPU",
};

/** Saved preference: the user chose not to see the run consent dialog again. */
const CONSENT_KEY = "benchmark_run_consent";

/** Generation settings the Run panel uses, fixed so runs stay comparable. */
const RUN_SETTINGS = { temperature: 0.2, topP: 0.9, maxTokens: 512 } as const;

function passLabel(step: BenchmarkProgressEvent): string {
  const pass = `Pass ${step.pass + 1} of ${step.totalPasses}`;
  return step.isWarmup ? `${pass} (warmup)` : pass;
}

function resultLabel(step: BenchmarkProgressEvent): string {
  if (step.state === "skipped") return "Skipped";
  if (step.state === "failed") return "Failed";
  if (step.passed === null) return step.state === "started" ? "Running" : "No keywords";
  return step.passed ? "Passed" : "Missed";
}

/** Progress of a running suite: a bar, the step now running, and the elapsed time. */
function RunProgress({
  steps,
  startedAt,
}: {
  steps: BenchmarkProgressEvent[];
  startedAt: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const first = steps[0];
  const total = first ? first.totalPasses * first.totalSteps : 0;
  const done = steps.filter((s) => s.state !== "started").length;
  const current = [...steps].reverse().find((s) => s.state === "started");

  if (!first) {
    return (
      <div className="suite-run__progress">
        <ProgressBar />
        <Meta>Preparing the run: checking the model and reading the suite. Elapsed {clock}</Meta>
      </div>
    );
  }

  return (
    <div className="suite-run__progress">
      <ProgressBar value={total > 0 ? done / total : undefined} />
      <Meta>
        {done} of {total} steps done · Elapsed {clock}
      </Meta>
      {current && (
        <Meta>
          Now: {passLabel(current)} · step {current.stepIndex + 1} of {current.totalSteps} ·{" "}
          {current.promptName}
        </Meta>
      )}
    </div>
  );
}

/**
 * Runs a saved suite on the model active in the top bar. If that model is loaded for another
 * compute target, the panel offers to reload it first. A run asks for consent first.
 */
export function SuiteRun({ suiteId, onFinished }: { suiteId: string; onFinished: () => void }) {
  const installed = useModelStore((s) => s.models);
  // The id the server reports, which is what the server accepts in a chat or run request.
  const activeModel = useModelStore((s) => s.activeModelId);
  const serverPort = useModelStore((s) => s.serverPort);
  const loadedCompute = useModelStore((s) => s.loadedCompute);
  const defaultCompute = useModelStore((s) => s.compute);
  const setLoadedCompute = useModelStore((s) => s.setLoadedCompute);

  // The compute target is the one selected in the top bar.
  const compute = defaultCompute;
  const [consented, setConsented] = useState(false);
  const [askingConsent, setAskingConsent] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const run = useSuiteRun(onFinished);

  // The store learns about loaded models only at startup and after some actions, so ask the server
  // again when the panel opens. Otherwise a model loaded since then looks unloaded here.
  useEffect(() => {
    const store = useModelStore.getState();
    geniex
      .getServerStatus(store.serverPort)
      .then((status) => useModelStore.getState().setServerStatus(status))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    db.getPreference<boolean>(CONSENT_KEY)
      .then((saved) => setConsented(saved === true))
      .catch(() => setConsented(false));
  }, []);

  // Settings are saved under the installed model's name, which can differ from the server's id.
  const installedName =
    activeModel === null
      ? null
      : (installed.find((m) => shortModelKey(m.name) === shortModelKey(activeModel))?.name ??
        activeModel);

  const busy = run.phase === "running" || reloading;
  const needsReload = loadedCompute !== compute;
  const canStart = activeModel !== null && !busy;

  // The same load settings chat sends: the model's saved settings with the selected compute target.
  const startNow = async (model: string) => {
    const load = { ...(await savedLoadParams(installedName ?? model)), compute };
    await run.start({
      suiteId,
      modelName: model,
      compute,
      port: serverPort,
      load,
      ...RUN_SETTINGS,
    });
  };

  /** After consent: start, or confirm the reload first when the compute target differs. */
  const proceed = () => {
    if (!activeModel) return;
    if (needsReload) {
      setConfirmReload(true);
    } else {
      void startNow(activeModel);
    }
  };

  const handleStart = () => {
    if (consented) {
      proceed();
    } else {
      setAskingConsent(true);
    }
  };

  const handleConsent = (dontShowAgain: boolean) => {
    setAskingConsent(false);
    if (dontShowAgain) {
      setConsented(true);
      db.setPreference(CONSENT_KEY, true, "boolean").catch(() => undefined);
    }
    proceed();
  };

  const reloadAndStart = async () => {
    setConfirmReload(false);
    if (!activeModel || !installedName) return;
    setReloading(true);
    try {
      const load = { ...(await savedLoadParams(installedName)), compute };
      await reloadModel(installedName, load);
      setLoadedCompute(compute);
    } catch (e) {
      toast.error("Could not reload the model", errorMessage(e));
      setReloading(false);
      return;
    }
    setReloading(false);
    void startNow(activeModel);
  };

  return (
    <section className="suite-run">
      <BodyStrong>Run</BodyStrong>
      {activeModel === null ? (
        <Meta>No model is loaded. Choose and load a model in the top bar first.</Meta>
      ) : (
        <Meta>Runs the active model on {COMPUTE_LABELS[compute]} with its saved settings.</Meta>
      )}

      <div className="suite-run__actions">
        {run.phase === "running" ? (
          <Button appearance="secondary" icon={<StopRegular />} onClick={() => void run.cancel()}>
            Cancel run
          </Button>
        ) : (
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={!canStart}
            onClick={handleStart}
          >
            {reloading ? "Reloading model…" : "Run suite"}
          </Button>
        )}
      </div>

      {run.error && <ErrorBanner message={run.error} />}

      {run.phase === "running" && <RunProgress steps={run.steps} startedAt={run.startedAt} />}

      {run.steps.length > 0 && (
        <table className="suite-run__table">
          <thead>
            <tr>
              <th>Pass</th>
              <th>Step</th>
              <th>Prompt</th>
              <th>Result</th>
              <th>TTFT (ms)</th>
              <th>Tokens/s</th>
            </tr>
          </thead>
          <tbody>
            {run.steps.map((step) => (
              <tr key={`${step.pass}-${step.stepIndex}`}>
                <td>{passLabel(step)}</td>
                <td>
                  {step.stepIndex + 1} of {step.totalSteps}
                </td>
                <td>{step.promptName}</td>
                <td>{resultLabel(step)}</td>
                <td>{step.ttftMs != null ? step.ttftMs.toFixed(0) : "—"}</td>
                <td>{step.tokensPerSec != null ? step.tokensPerSec.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {run.phase === "finished" && run.finished && (
        <Meta>
          Run {run.finished.status}
          {run.finished.error ? `: ${run.finished.error}` : ""}
        </Meta>
      )}

      {askingConsent && (
        <RunConsentDialog onConfirm={handleConsent} onCancel={() => setAskingConsent(false)} />
      )}

      {confirmReload && (
        <ConfirmDialog
          title="Reload the model to run it?"
          message={`The model is loaded for ${loadedCompute ? COMPUTE_LABELS[loadedCompute] : "another target"}. Reloading it on ${COMPUTE_LABELS[compute]} stops any chat reply in progress and takes a moment.`}
          confirmLabel="Reload and run"
          onConfirm={() => void reloadAndStart()}
          onCancel={() => setConfirmReload(false)}
        />
      )}
    </section>
  );
}
