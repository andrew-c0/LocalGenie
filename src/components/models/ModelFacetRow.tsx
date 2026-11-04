import {
  type BaseRelation,
  type HubFacetSummary,
  sizeLabelOf,
  TASK_GROUPS,
  taskGroupOf,
  taskLabel,
} from "../../utils/hubModelInfo";
import { quantisationRangeOf } from "../../utils/modelSpecs";
import { ModelFacts } from "./ModelFacts";

const RELATION_TEXT: Record<BaseRelation, string> = {
  quantized: "Quantised from",
  finetune: "Fine-tune of",
  adapter: "Adapter of",
  merge: "Merge of",
};

/**
 * The quantisation text: the repo's own precisions from its file list, as a range (`Q2_K to Q8_0`).
 * Without a file list it falls back to the Hub's `4-bit` and `8-bit` tags.
 */
function quantisationFact(
  facets: HubFacetSummary,
  precisions: string[] | undefined,
): { value: string | null; title?: string } {
  const range = quantisationRangeOf(precisions ?? []);
  if (range) return { value: range.text, title: range.bits };
  return {
    value: facets.quantBits.length > 0 ? facets.quantBits.map((b) => `${b}-bit`).join(", ") : null,
  };
}

/**
 * The six facets of a model. Shared by the Hugging Face detail page and stored models. A facet the
 * model does not have shows `N/A`. `precisions` is the repo's file precisions when they are known
 * (Hugging Face detail page only).
 */
export function ModelFacetRow({
  facets,
  precisions,
}: {
  facets: HubFacetSummary;
  precisions?: string[];
}) {
  const group = TASK_GROUPS.find((g) => g.id === taskGroupOf(facets.task))?.label;
  const tree = facets.baseRepo
    ? `${RELATION_TEXT[facets.baseRelation ?? "quantized"]} ${facets.baseRepo}`
    : "Base model";
  const quant = quantisationFact(facets, precisions);
  return (
    <ModelFacts
      facts={[
        {
          label: "Task",
          value: facets.task ? `${taskLabel(facets.task)}${group ? ` · ${group}` : ""}` : null,
        },
        {
          label: "Parameters",
          value: sizeLabelOf(facets),
          title: facets.paramCountApproximate ? "Approximate: from the GGUF metadata" : undefined,
        },
        { label: "Library", value: facets.library },
        { label: "License", value: facets.license },
        { label: "Model tree", value: tree },
        { label: "Quantisation", value: quant.value, title: quant.title },
      ]}
    />
  );
}
