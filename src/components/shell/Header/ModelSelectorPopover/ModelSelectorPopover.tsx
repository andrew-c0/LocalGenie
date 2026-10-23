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
import type { ModelInfo } from "../../../../types";
import { FAMILY_ALL, familyFilterOptions, matchesFamily } from "../../../../utils/modelFamily";
import { shortModelKey } from "../../../../utils/modelKey";
import { Flex } from "../../../ui/Flex/Flex";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { LOADING_UNLOAD } from "../useModelLoader";
import { CapabilityModelOption } from "./CapabilityModelOption/CapabilityModelOption";
import type { ModelOptionButtonProps } from "./ModelOptionButton/ModelOptionButton";
import "./ModelSelectorPopover.css";

/** Label + description for each compute target. */
const COMPUTE_META: Record<ComputeChoice, { label: string; hint: string }> = {
  npu: { label: "NPU", hint: "Hexagon HTP — fastest, most efficient" },
  gpu: { label: "GPU", hint: "Adreno OpenCL path" },
  cpu: { label: "CPU", hint: "Baseline; slowest but always available" },
};

interface ModelSelectorPopoverProps {
  /** Model name, or a LOADING_* key, while an action is in progress. */
  loading: string | null;
  error: string | null;
  onSelect: (name: string) => void;
  onComputeChange: (next: ComputeChoice) => void;
  onUnload: () => void;
}

/**
 * Model switcher shown inside the header's Popover. Actions and their state come from the header
 * (`useModelLoader`); this component handles filtering and layout only.
 */
export default function ModelSelectorPopover({
  loading,
  error,
  onSelect,
  onComputeChange,
  onUnload,
}: ModelSelectorPopoverProps) {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const compute = useModelStore((s) => s.compute);

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(FAMILY_ALL);

  useEffect(() => {
    if (selectorOpen) {
      setQuery("");
      setFamily(FAMILY_ALL);
    }
  }, [selectorOpen]);

  const familyOptions = useMemo(() => familyFilterOptions(models.map((m) => m.name)), [models]);
  const activeFamily = familyOptions.some(([id]) => id === family) ? family : FAMILY_ALL;

  const { loadedModels, readyModels } = useMemo(() => {
    const loadedNames = new Set(serverStatus.models.map(shortModelKey));
    const loaded: ModelInfo[] = [];
    const ready: ModelInfo[] = [];
    const q = query.trim().toLowerCase();
    for (const m of models) {
      const base = m.name.split("/").pop() ?? m.name;
      if (q && !base.toLowerCase().includes(q)) continue;
      if (!matchesFamily(m.name, activeFamily)) continue;
      if (loadedNames.has(shortModelKey(m.name))) loaded.push(m);
      else ready.push(m);
    }
    return { loadedModels: loaded, readyModels: ready };
  }, [models, serverStatus.models, query, activeFamily]);

  const hasRows = loadedModels.length > 0 || readyModels.length > 0;

  // The header shows the first loaded model when none is chosen explicitly; match that here.
  // The store keeps short names from server status, so compare base names.
  const activeBase = (activeModelId ?? loadedModels[0]?.name)?.split("/").pop() ?? null;

  const close = () => setSelectorOpen(false);

  const handleComputeSelect = (_: unknown, data: RadioGroupOnChangeData) => {
    const next = COMPUTE_TARGETS.find((t) => t === data.value);
    if (next) onComputeChange(next);
  };

  const isLoadedOnServer = (m: ModelInfo) => {
    const key = shortModelKey(m.name);
    return serverStatus.models.some((lm) => shortModelKey(lm) === key);
  };

  const optionProps = (m: ModelInfo): ModelOptionButtonProps => ({
    model: m,
    isActive: activeBase !== null && activeBase === (m.name.split("/").pop() ?? m.name),
    loadedHere: isLoadedOnServer(m),
    loading: loading === m.name,
    disabled: loading !== null,
    onSelect,
  });

  // Every row goes through the same wrapper, so each row loads its capability icons once, on mount.
  const renderOption = (m: ModelInfo) => <CapabilityModelOption key={m.name} {...optionProps(m)} />;

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

          {loadedModels.length > 0 && (
            <MenuGroup>
              <MenuGroupHeader>
                Loaded & Active · {serverStatus.running ? COMPUTE_META[compute].label : "Server"}
              </MenuGroupHeader>
              {loadedModels.map(renderOption)}
            </MenuGroup>
          )}

          {readyModels.length > 0 && (
            <MenuGroup>
              <MenuGroupHeader>Installed & Ready to Load · {readyModels.length}</MenuGroupHeader>
              {readyModels.map(renderOption)}
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
              close();
              navigate("/settings");
            }}
          >
            Manage Weights & Storage
          </Button>
        </Flex>
        {serverStatus.running && serverStatus.models.length > 0 && (
          <Button
            appearance="secondary"
            icon={
              loading === LOADING_UNLOAD ? <Spinner size="tiny" /> : <PlugDisconnectedRegular />
            }
            title="Unload all models"
            disabled={loading !== null}
            onClick={onUnload}
          >
            Unload
          </Button>
        )}
      </Flex>
    </PopoverSurface>
  );
}
