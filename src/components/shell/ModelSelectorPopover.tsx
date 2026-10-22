import type { RadioGroupOnChangeData } from "@fluentui/react-components";
import {
  Button,
  Caption1,
  Caption1Strong,
  Divider,
  Input,
  MessageBar,
  MessageBarBody,
  makeStyles,
  PopoverSurface,
  Radio,
  RadioGroup,
  Spinner,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular,
  DismissRegular,
  PlugDisconnectedRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as geniex from "../../services/geniex";
import { useChatStore } from "../../stores/chatStore";
import {
  COMPUTE_TARGETS,
  type ComputeChoice,
  DEFAULT_COMPUTE,
  useModelStore,
} from "../../stores/modelStore";
import type { ModelInfo } from "../../types";
import { ModelOptionButton } from "./ModelOptionButton";

/** Label + description for each compute target. */
const COMPUTE_META: Record<ComputeChoice, { label: string; hint: string }> = {
  npu: { label: "NPU", hint: "Hexagon HTP — fastest, most efficient" },
  gpu: { label: "GPU", hint: "Adreno OpenCL path" },
  cpu: { label: "CPU", hint: "Baseline; slowest but always available" },
};

const useStyles = makeStyles({
  surface: {
    minWidth: "360px",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    overflowY: "auto",
  },
  section: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: tokens.spacingVerticalS,
  },
  computeRow: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  footerGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
  inline: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

/**
 * Model switcher shown inside the header's Popover. Open state is owned by the
 * model store (other pages open it too), so this component only renders content.
 */
export default function ModelSelectorPopover() {
  const styles = useStyles();
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const compute = useModelStore((s) => s.compute);
  const setCompute = useModelStore((s) => s.setCompute);
  const serverCompute = useModelStore((s) => s.serverCompute);
  const setServerCompute = useModelStore((s) => s.setServerCompute);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Compute target the running server was started with; unknown (external) servers are assumed default. */
  const runningCompute = serverCompute ?? DEFAULT_COMPUTE;

  useEffect(() => {
    if (selectorOpen) {
      setQuery("");
      setError(null);
    }
  }, [selectorOpen]);

  const { loadedModels, readyModels } = useMemo(() => {
    const loadedNames = new Set(serverStatus.models.map((m) => m.split(":")[0]));
    const loaded: ModelInfo[] = [];
    const ready: ModelInfo[] = [];
    const q = query.trim().toLowerCase();
    for (const m of models) {
      const base = m.name.split("/").pop() ?? m.name;
      if (q && !base.toLowerCase().includes(q)) continue;
      if (loadedNames.has(base)) loaded.push(m);
      else ready.push(m);
    }
    return { loadedModels: loaded, readyModels: ready };
  }, [models, serverStatus.models, query]);

  const close = () => setSelectorOpen(false);

  /** Load a model and set it active; also binds it to the open chat session. */
  const handleSelect = async (name: string) => {
    const base = name.split("/").pop() ?? name;
    if (serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`))) {
      setActiveModel(name);
      close();
      return;
    }
    setLoading(name);
    setError(null);
    try {
      // A server spawned with a different compute target must be restarted for the flag to apply.
      const needsRestart = serverStatus.running && compute !== runningCompute;
      if (needsRestart) {
        await geniex.stopServer(serverPort);
      }
      if (needsRestart || !serverStatus.running) {
        const started = await geniex.startServer({ port: serverPort, compute });
        setServerStatus(started);
        setServerCompute(compute);
      }
      const status = await geniex.loadModel(name);
      setServerStatus(status);
      setActiveModel(name);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, name);
      close();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Switch the compute target; restarts the server when it is running. */
  const handleComputeChange = async (next: ComputeChoice) => {
    const prev = compute;
    setCompute(next);
    if (!serverStatus.running || next === prev) return;
    setLoading("__compute__");
    setError(null);
    try {
      await geniex.stopServer(serverPort);
      setServerCompute(null);
      const started = await geniex.startServer({ port: serverPort, compute: next });
      setServerStatus(started);
      setServerCompute(next);
    } catch (err) {
      setCompute(prev);
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Unload all models from the server (stops the server, the only unload mechanism). */
  const handleUnload = async () => {
    setLoading("__unload__");
    setError(null);
    try {
      const status = await geniex.unloadAllModels(serverPort);
      setServerStatus(status);
      setActiveModel(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  const handleComputeSelect = (_: unknown, data: RadioGroupOnChangeData) => {
    const next = COMPUTE_TARGETS.find((t) => t === data.value);
    if (next) handleComputeChange(next);
  };

  const isLoadedOnServer = (m: ModelInfo) => {
    const base = m.name.split("/").pop() ?? m.name;
    return serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`));
  };

  const renderOption = (m: ModelInfo) => (
    <ModelOptionButton
      key={m.name}
      model={m}
      isActive={activeModelId === m.name}
      loadedHere={isLoadedOnServer(m)}
      loading={loading === m.name}
      disabled={loading !== null}
      onSelect={handleSelect}
    />
  );

  return (
    <PopoverSurface className={styles.surface} aria-label="Switch active model">
      <Input
        autoFocus
        placeholder="Filter installed models..."
        aria-label="Filter installed models"
        value={query}
        onChange={(_, data) => setQuery(data.value)}
        contentBefore={<SearchRegular />}
        contentAfter={
          <Button
            appearance="transparent"
            icon={<DismissRegular />}
            onClick={close}
            aria-label="Close"
            title="Close"
          />
        }
      />

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.computeRow}>
        <div className={styles.inline}>
          <Caption1Strong>Run on</Caption1Strong>
          <RadioGroup
            layout="horizontal"
            value={compute}
            disabled={loading !== null}
            onChange={handleComputeSelect}
            aria-label="Compute target"
          >
            {COMPUTE_TARGETS.map((t) => (
              <Radio key={t} value={t} label={COMPUTE_META[t].label} />
            ))}
          </RadioGroup>
          {loading === "__compute__" && <Spinner size="tiny" />}
        </div>
        <Caption1>{COMPUTE_META[compute].hint}</Caption1>
      </div>

      <div className={styles.list}>
        {loadedModels.length > 0 && (
          <>
            <div className={styles.section}>
              <Caption1Strong>Loaded & Active</Caption1Strong>
              <Caption1>
                {serverStatus.running ? `Compute: ${COMPUTE_META[compute].label}` : "Server"}
              </Caption1>
            </div>
            {loadedModels.map(renderOption)}
          </>
        )}

        {readyModels.length > 0 && (
          <>
            <div className={styles.section}>
              <Caption1Strong>Installed & Ready to Load</Caption1Strong>
              <Caption1>{readyModels.length} available</Caption1>
            </div>
            {readyModels.map(renderOption)}
          </>
        )}

        {loadedModels.length === 0 && readyModels.length === 0 && (
          <Caption1>{query ? `No models match "${query}".` : "No models installed yet."}</Caption1>
        )}
      </div>

      <Divider />

      <div className={styles.footer}>
        <div className={styles.footerGroup}>
          <Button
            appearance="subtle"
            icon={<ArrowRightRegular />}
            iconPosition="after"
            onClick={() => {
              close();
              navigate("/models");
            }}
          >
            Browse Model Hub...
          </Button>
          <Button
            appearance="subtle"
            onClick={() => {
              close();
              navigate("/settings");
            }}
          >
            Manage Weights & Storage
          </Button>
        </div>
        {serverStatus.running && serverStatus.models.length > 0 && (
          <Button
            appearance="subtle"
            icon={loading === "__unload__" ? <Spinner size="tiny" /> : <PlugDisconnectedRegular />}
            title="Unload all models"
            disabled={loading !== null}
            onClick={handleUnload}
          >
            Unload
          </Button>
        )}
      </div>
    </PopoverSurface>
  );
}
