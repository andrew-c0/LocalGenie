import { Button } from "@fluentui/react-components";
import type { SpeechOutputFile } from "../../../types";
import { USE_AS_INPUT_LABEL } from "../../../utils/audioText";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong } from "../../ui/Typography/Typography";
import { AudioWaveformPlayer } from "../AudioWaveformPlayer/AudioWaveformPlayer";

interface AudioOutputPlayerProps {
  output: SpeechOutputFile;
  /** Takes this file as the input audio. The task stays on clean up or split. */
  onUseAsInput: (path: string) => void;
}

/** One file a clean up or split saved: its label, Use as input, and a player. */
export function AudioOutputPlayer({ output, onUseAsInput }: AudioOutputPlayerProps) {
  return (
    <Flex direction="column" gap="s">
      <Flex justify="between" align="center" gap="m" wrap>
        <BodyStrong>{output.label}</BodyStrong>
        <Button appearance="secondary" onClick={() => onUseAsInput(output.path)}>
          {USE_AS_INPUT_LABEL}
        </Button>
      </Flex>
      <AudioWaveformPlayer path={output.path} />
    </Flex>
  );
}
