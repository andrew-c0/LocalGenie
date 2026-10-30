import type { RadioGroupOnChangeData } from "@fluentui/react-components";
import {
  Button,
  Caption1,
  Divider,
  Field,
  Input,
  MenuGroup,
  MenuGroupHeader,
  MenuList,
  MessageBar,
  MessageBarBody,
  PopoverSurface,
  Radio,
  RadioGroup,
  Select,
  Spinner,
} from "@fluentui/react-components";
import { PlugDisconnectedRegular, SearchRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMPUTE_TARGETS, type ComputeChoice, useModelStore } from "../../../../stores/modelStore";
import { FAMILY_ALL, familyFilterOptions, matchesFamily } from "../../../../utils/modelFamily";
import { modelRamLine } from "../../../../utils/modelRam";
import {
  occupantOf,
  replacedRamBytes,
  type SelectorRow,
  selectorGroups,
} from "../../../../utils/modelSelector";
import { Flex } from "../../../ui/Flex/Flex";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { LOADING_UNLOAD, type ModelLoader } from "../useModelLoader";
import { ModelSelectorRow } from "./ModelSelectorRow/ModelSelectorRow";
import { ReplaceModelNotice } from "./ReplaceModelNotice/ReplaceModelNotice";
import { useRamSnapshot } from "./useRamSnapshot";
import { useResolvedComputes } from "./useResolvedComputes";
import "./ModelSelectorPopover.css";

/** Label + description for each compute target. */
const COMPUTE_META: Record<ComputeChoice, { label: string; hint: string }> = {
  npu: { label: "NPU", hint: "Hexagon HTP — fastest, most efficient" },
  gpu: { label: "GPU", hint: "Adreno OpenCL path" },
  cpu: { label: "CPU", hint: "Baseline; slowest but always available" },
};

/** Footer button text: what is running, or "Unload all" when idle. */
function unloadAllLabel(loading: string | null): string {
  if (loading === LOADING_UNLOAD) return "Unloading…";
  if (loading !== null) return "Loading…";
  return "Unload all";
}

interface ModelSelectorPopoverProps {
  /** The header's loader: actions, the in-progress marker and the last error. */
  loader: ModelLoader;
}

/**
 * Model switcher shown inside the header's Popover. Actions and their state come from the header
 * (`useModelLoader`); this component handles filtering, grouping and layout. A load that would replace
 * the model on its compute asks for confirmation here first.
 */
export default function ModelSelectorPopover({ loader }: ModelSelectorPopoverProps) {
  const { loading, error, selectModel, changeCompute, unloadCompute, unloadAll } = loader;
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const loadedServers = useModelStore((s) => s.loadedServers);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const compute = useModelStore((s) => s.compute);

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(FAMILY_ALL);
  /** Name of a model whose load needs the model on its compute unloaded first. */
  const [pendingReplace, setPendingReplace] = useState<string | null>(null);

  useEffect(() => {
    if (selectorOpen) {
      setQuery("");
      setFamily(FAMILY_ALL);
      setPendingReplace(null);
    }
  }, [selectorOpen]);

  const modelNames = useMemo(() => models.map((m) => m.name), [models]);
  const ramSnapshot = useRamSnapshot(selectorOpen, modelNames);
  const resolved = useResolvedComputes(selectorOpen, modelNames);
  const familyOptions = useMemo(() => familyFilterOptions(modelNames), [modelNames]);
  const activeFamily = familyOptions.some(([id]) => id === family) ? family : FAMILY_ALL;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      const base = m.name.split("/").pop() ?? m.name;
      if (q && !base.toLowerCase().includes(q)) return false;
      return matchesFamily(m.name, activeFamily);
    });
  }, [models, query, activeFamily]);

  const groups = useMemo(
    () => selectorGroups(filtered, loadedServers, activeModelId, resolved),
    [filtered, loadedServers, activeModelId, resolved],
  );
  const hasRows = groups.loaded.length > 0 || groups.ready.length > 0;
  const loadedCount = groups.loaded.length;
  const anythingLoaded = activeModelId !== null || Object.keys(loadedServers).length > 0;

  const handleComputeSelect = (_: unknown, data: RadioGroupOnChangeData) => {
    const next = COMPUTE_TARGETS.find((t) => t === data.value);
    if (next) changeCompute(next);
  };

  /** Loads or switches to `name`. A load that would replace a model waits for confirmation. */
  const choose = async (name: string) => {
    const outcome = await selectModel(name);
    if (outcome === "needs-replace") setPendingReplace(name);
  };

  const confirmReplace = async (name: string) => {
    setPendingReplace(null);
    await selectModel(name, { replace: true });
  };

  // The occupant of the pending model's compute, for the confirmation text.
  const pendingOccupant =
    pendingReplace === null ? null : occupantOf(loadedServers, resolved[pendingReplace] ?? null);

  /** The RAM line for a row. A loaded row is not checked; a ready row counts the model it replaces. */
  const ramLineOf = (row: SelectorRow) =>
    modelRamLine(
      ramSnapshot,
      row.model,
      row.loaded,
      row.loaded ? 0 : replacedRamBytes(ramSnapshot, models, loadedServers, row.compute),
    );

  const renderRow = (row: SelectorRow) => (
    <ModelSelectorRow
      key={row.model.name}
      row={row}
      ram={ramLineOf(row)}
      loading={loading}
      onChoose={(name) => void choose(name)}
      onUnload={(target) => void unloadCompute(target)}
    />
  );

  return (
    <PopoverSurface className="model-selector" aria-label="Switch active model">
      <Input
        autoFocus
        placeholder="Filter installed models..."
        aria-label="Filter installed models"
        value={query}
        onChange={(_, data) => setQuery(data.value)}
        contentBefore={<SearchRegular />}
      />

      {familyOptions.length > 2 && (
        <Field label="Family" orientation="horizontal">
          <Select
            size="small"
            aria-label="Filter models by family"
            value={activeFamily}
            onChange={(_, data) => setFamily(data.value)}
          >
            {familyOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {pendingReplace !== null && (
        <ReplaceModelNotice
          modelName={pendingReplace}
          occupant={pendingOccupant}
          disabled={loading !== null}
          onCancel={() => setPendingReplace(null)}
          onConfirm={() => void confirmReplace(pendingReplace)}
        />
      )}

      <Flex direction="column" align="stretch">
        <Flex direction="column" gap="xxs" align="stretch">
          <Flex align="center" justify="between" gap="m">
            <Body>Run on</Body>
            <RadioGroup
              className="model-selector__run-on"
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
          </Flex>
          <Flex justify="end">
            <Meta>{COMPUTE_META[compute].hint}</Meta>
          </Flex>
        </Flex>
      </Flex>

      <Flex direction="column" align="stretch" className="model-table">
        <MenuList className="model-table__list">
          {hasRows && (
            // One column heading for the whole list. It lines up with the cells in every group below.
            <MenuGroupHeader className="model-table__row model-table__heading">
              <span className="model-table__cell model-table__cell--name">Model</span>
              <span className="model-table__cell model-table__cell--quant">Quant</span>
              <span className="model-table__cell model-table__cell--size">Size</span>
              <span className="model-table__cell model-table__cell--caps">Capabilities</span>
            </MenuGroupHeader>
          )}

          {groups.loaded.length > 0 && (
            <MenuGroup>
              <MenuGroupHeader>Loaded · {loadedCount}</MenuGroupHeader>
              {groups.loaded.map(renderRow)}
            </MenuGroup>
          )}

          {groups.ready.length > 0 && (
            <MenuGroup>
              <MenuGroupHeader>Installed & Ready to Load · {groups.ready.length}</MenuGroupHeader>
              {groups.ready.map(renderRow)}
            </MenuGroup>
          )}
        </MenuList>
      </Flex>

      {!hasRows && (
        <Caption1>{query ? `No models match "${query}".` : "No models installed yet."}</Caption1>
      )}

      <Divider />

      <Flex justify="between" align="center" gap="s" wrap>
        <Flex gap="s" wrap>
          <Button
            appearance="secondary"
            onClick={() => {
              setSelectorOpen(false);
              navigate("/settings");
            }}
          >
            Manage Weights & Storage
          </Button>
        </Flex>
        {/* The footer button shows progress for any load or unload, so a load is visible here too. */}
        {(loading !== null || anythingLoaded) && (
          <Button
            appearance="secondary"
            icon={loading !== null ? <Spinner size="tiny" /> : <PlugDisconnectedRegular />}
            title={loading !== null ? "Working" : "Unload all models"}
            disabled={loading !== null}
            onClick={() => void unloadAll()}
          >
            {unloadAllLabel(loading)}
          </Button>
        )}
      </Flex>
    </PopoverSurface>
  );
}
