import { precisionInfo } from "../../services/hubApi";
import {
  type BaseRelation,
  type HubFacetSummary,
  sizeLabelOf,
  TASK_GROUPS,
  taskGroupOf,
  taskLabel,
} from "../../utils/hubModelInfo";
import { ModelFacts } from "./ModelFacts";

const RELATION_TEXT: Record<BaseRelation, string> = {
  quantized: "Quantised from",
  finetune: "Fine-tune of",
  adapter: "Adapter of",
  merge: "Merge of",
};

/**
 * The quantisation text: the repo's own precisions from its file list, lowest bits first, as a range
 * (`Q2_K to Q8_0`). Without a file list it falls back to the Hub's `4-bit` and `8-bit` tags.
 */
function quantisationOf(
  facets: HubFacetSummary,
  precisions: string[] | undefined,
): [string | null, string | undefined] {
  if (precisions && precisions.length > 0) {
    const bitsOf = (p: string) => precisionInfo(p).bitsPerWeight ?? Number.POSITIVE_INFINITY;
    const sorted = [...new Set(precisions)].sort((a, b) => bitsOf(a) - bitsOf(b));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const range =
      Number.isFinite(bitsOf(first)) && Number.isFinite(bitsOf(last))
        ? `${bitsOf(first)}–${bitsOf(last)} bit`
        : undefined;
    return [sorted.length === 1 ? first : `${first} to ${last}`, range];
  }
  return [
    facets.quantBits.length > 0 ? facets.quantBits.map((b) => `${b}-bit`).join(", ") : null,
    undefined,
  ];
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
  const [quant, quantRange] = quantisationOf(facets, precisions);
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
        { label: "Quantisation", value: quant, title: quantRange },
      ]}
    />
  );
}
