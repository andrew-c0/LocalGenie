import {
  ArrowMaximizeRegular,
  ArrowSplitRegular,
  BrainCircuitRegular,
  DismissCircleRegular,
  DocumentTextRegular,
  EyeRegular,
  ImageEditRegular,
  ImageRegular,
  ImageSparkleRegular,
  MicRegular,
  PersonVoiceRegular,
  Speaker2Regular,
  SpeakerMuteRegular,
  TableRegular,
  WrenchRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { CapabilityBadge, CapabilityBadgeId } from "../../../utils/modelCapabilities";
import { Flex } from "../Flex/Flex";
import "./ModelCapabilityIcons.css";

const ICONS: Record<CapabilityBadgeId, ReactElement> = {
  tools: <WrenchRegular />,
  thinking: <BrainCircuitRegular />,
  vision: <EyeRegular />,
  audio: <MicRegular />,
  textToImage: <ImageRegular />,
  imageEdit: <ImageEditRegular />,
  redraw: <ImageSparkleRegular />,
  negativePrompt: <DismissCircleRegular />,
  upscale: <ArrowMaximizeRegular />,
  speechToText: <MicRegular />,
  textToSpeech: <Speaker2Regular />,
  voiceCloning: <PersonVoiceRegular />,
  denoise: <SpeakerMuteRegular />,
  stemSplit: <ArrowSplitRegular />,
  ocrText: <DocumentTextRegular />,
  ocrTables: <TableRegular />,
};

interface ModelCapabilityIconsProps {
  /** Confirmed badges only. Renders nothing when empty. */
  badges: CapabilityBadge[];
}

/** Read-only row of capability icons for one model. Each icon is labelled; none is clickable. */
export function ModelCapabilityIcons({ badges }: ModelCapabilityIconsProps) {
  if (badges.length === 0) return null;
  return (
    <Flex align="center" gap="xxs" className="model-capability-icons">
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`model-capability-icons__icon model-capability-icons__icon--${badge.id}`}
          role="img"
          title={badge.label}
          aria-label={badge.label}
        >
          {ICONS[badge.id]}
        </span>
      ))}
    </Flex>
  );
}
