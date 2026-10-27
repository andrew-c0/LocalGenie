import { Button, Dropdown, Option, Switch, ToggleButton } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { activeFacetCount, useHubBrowseStore } from "../../../../stores/hubBrowseStore";
import {
  BASE_RELATIONS,
  PIPELINES_BY_GROUP,
  TASK_GROUPS,
  taskLabel,
} from "../../../../utils/hubModelInfo";
import { Meta } from "../../../ui/Typography/Typography";
import { CatalogueCombobox } from "./CatalogueCombobox";
import { CommitInput } from "./CommitInput";
import { useHubTags } from "./useHubTags";
import "./HubFacetPanel.css";

const QUANT_BITS = [4, 8] as const;

/** A parameter bound typed in billions. Empty or not a number means no bound. */
function parseBillions(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The facet filters of the Hugging Face browser: task, size, library, licence, model tree and quantisation. */
export function HubFacetPanel() {
  const facets = useHubBrowseStore((s) => s.facets);
  const setFacet = useHubBrowseStore((s) => s.setFacet);
  const clearFacets = useHubBrowseStore((s) => s.clearFacets);
  const { tags, error } = useHubTags();
  const count = activeFacetCount(facets);

  // Task options come from the static group map; the Hub's catalogue supplies library and licence.
  const taskOptions = TASK_GROUPS.flatMap((g) => [
    <Option key={`group-${g.id}`} value={`group-${g.id}`} text={g.label} disabled>
      {g.label}
    </Option>,
    ...PIPELINES_BY_GROUP[g.id].map((id) => (
      <Option key={id} value={id} text={taskLabel(id)}>
        {taskLabel(id)}
      </Option>
    )),
  ]);

  return (
    <div className="hub-facet-panel">
      <div className="hub-facet-panel__field">
        <Meta>Task</Meta>
        <Dropdown
          aria-label="Task"
          value={facets.task ? taskLabel(facets.task) : "Any task"}
          selectedOptions={[facets.task ?? ""]}
          onOptionSelect={(_, data) => {
            if (!data.optionValue?.startsWith("group-")) setFacet("task", data.optionValue || null);
          }}
        >
          <Option value="" text="Any task">
            Any task
          </Option>
          {taskOptions}
        </Dropdown>
      </div>

      <div className="hub-facet-panel__field">
        <Meta>Parameters (billions)</Meta>
        <div className="hub-facet-panel__pair">
          <CommitInput
            label="Minimum parameters in billions"
            placeholder="Min"
            inputMode="decimal"
            value={facets.paramMin == null ? "" : String(facets.paramMin)}
            onCommit={(text) => setFacet("paramMin", parseBillions(text))}
          />
          <CommitInput
            label="Maximum parameters in billions"
            placeholder="Max"
            inputMode="decimal"
            value={facets.paramMax == null ? "" : String(facets.paramMax)}
            onCommit={(text) => setFacet("paramMax", parseBillions(text))}
          />
        </div>
      </div>

      <div className="hub-facet-panel__field">
        <Meta>Library</Meta>
        <CatalogueCombobox
          label="Library"
          options={(tags?.library ?? []).map((t) => ({ value: t.id, label: t.label }))}
          value={facets.library}
          onSelect={(value) => setFacet("library", value)}
        />
      </div>

      <div className="hub-facet-panel__field">
        <Meta>License</Meta>
        <CatalogueCombobox
          label="License"
          options={(tags?.license ?? []).map((id) => ({ value: id, label: id }))}
          value={facets.license}
          onSelect={(value) => setFacet("license", value)}
        />
      </div>

      <div className="hub-facet-panel__field hub-facet-panel__wide">
        <Meta>Model tree</Meta>
        <div className="hub-facet-panel__row">
          {BASE_RELATIONS.map((relation) => (
            <ToggleButton
              key={relation}
              size="small"
              checked={facets.baseRelation === relation}
              onClick={() => setFacet("baseRelation", relation)}
            >
              {relation}
            </ToggleButton>
          ))}
        </div>
        <div className="hub-facet-panel__row">
          <div className="hub-facet-panel__grow">
            <CommitInput
              label="Base repo id"
              placeholder="Base repo, e.g. org/model"
              value={facets.baseRepo}
              onCommit={(text) => setFacet("baseRepo", text.trim())}
            />
          </div>
          <Switch
            label="Base models only"
            checked={facets.baseOnly}
            onChange={(_, data) => setFacet("baseOnly", data.checked)}
            title="Hides models that have a base model. Applies to the loaded results only."
          />
        </div>
        <Meta>
          The tree filter needs a base repo and applies with the relation above. Base models only
          applies to the loaded results.
        </Meta>
      </div>

      <div className="hub-facet-panel__field">
        <Meta>Quantisation</Meta>
        <div className="hub-facet-panel__row">
          {QUANT_BITS.map((bits) => (
            <ToggleButton
              key={bits}
              size="small"
              checked={facets.quantBits.includes(bits)}
              onClick={() =>
                setFacet(
                  "quantBits",
                  facets.quantBits.includes(bits)
                    ? facets.quantBits.filter((b) => b !== bits)
                    : [...facets.quantBits, bits],
                )
              }
            >
              {`${bits}-bit`}
            </ToggleButton>
          ))}
        </div>
      </div>

      {error && (
        <Meta className="hub-facet-panel__wide">
          Library and licence values could not load: {error}
        </Meta>
      )}

      {count > 0 && (
        <div className="hub-facet-panel__wide">
          <Button appearance="secondary" icon={<DismissRegular />} onClick={clearFacets}>
            Clear {count} filter(s)
          </Button>
        </div>
      )}
    </div>
  );
}
