import { ModelSpecSection } from "../../../../components/models/ModelSpecSection/ModelSpecSection";
import { Flex } from "../../../../components/ui/Flex/Flex";
import { Body, Meta } from "../../../../components/ui/Typography/Typography";
import type { AihubModelDetail } from "../../../../services/aihub";
import type { SpecCell } from "../../../../utils/modelSpecs";
import "./AihubAboutSection.css";

interface Props {
  detail: AihubModelDetail;
}

/**
 * The description, tags, research paper and applicable scenarios of an AI Hub model. The tags and the
 * paper are label and value cells, like the Specifications grid. Renders nothing when the model lists
 * none of them.
 */
export function AihubAboutSection({ detail }: Props) {
  const scenarios = detail.applicableScenarios;
  const cells: SpecCell[] = [
    {
      label: "Tags",
      value:
        detail.tags.length > 0 ? detail.tags.map((tag) => tag.replace(/_/g, " ")).join(", ") : null,
    },
    {
      label: "Research paper",
      value: detail.researchPaper ? (detail.researchPaperTitle ?? detail.researchPaper) : null,
      href: detail.researchPaper,
    },
  ];
  const hasAny = Boolean(detail.description) || scenarios.length > 0 || cells.some((c) => c.value);
  if (!hasAny) return null;

  return (
    <ModelSpecSection title="About" cells={cells}>
      {detail.description && <Body>{detail.description}</Body>}

      {scenarios.length > 0 && (
        <Flex direction="column" gap="xxs">
          <Meta>Applicable scenarios</Meta>
          <ul className="aihub-about__list">
            {scenarios.map((scenario) => (
              <li key={scenario}>
                <Body>{scenario}</Body>
              </li>
            ))}
          </ul>
        </Flex>
      )}
    </ModelSpecSection>
  );
}
