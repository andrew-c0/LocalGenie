import type { CapabilityBadge } from "../../utils/modelCapabilities";
import { capabilityMeaning, type SpecCell } from "../../utils/modelSpecs";
import { Flex } from "../ui/Flex/Flex";
import { ModelCapabilityIcons } from "../ui/ModelCapabilityIcons/ModelCapabilityIcons";
import { Body } from "../ui/Typography/Typography";
import { ModelSpecSection } from "./ModelSpecSection/ModelSpecSection";

interface CapabilitiesSectionProps {
  badges: CapabilityBadge[];
  /** True when the badges are guesses from the Hub's metadata, so the line says so. */
  isInferred?: boolean;
  /** Compatibility and fit cells, shown under the icons. */
  cells?: SpecCell[];
}

/**
 * The capabilities of a model: the icons, then a line of what each means, then any cells. Shared by
 * the Hugging Face, AI Hub and installed model pages. Hidden when it has nothing to show.
 */
export function CapabilitiesSection({
  badges,
  isInferred = false,
  cells,
}: CapabilitiesSectionProps) {
  const meaning = capabilityMeaning(badges);
  const content =
    badges.length > 0 ? (
      <Flex align="center" gap="s" wrap>
        <ModelCapabilityIcons badges={badges} />
        <Body>{isInferred ? `${meaning} (inferred)` : meaning}</Body>
      </Flex>
    ) : undefined;
  return (
    <ModelSpecSection title="Capabilities & compatibility" cells={cells}>
      {content}
    </ModelSpecSection>
  );
}
