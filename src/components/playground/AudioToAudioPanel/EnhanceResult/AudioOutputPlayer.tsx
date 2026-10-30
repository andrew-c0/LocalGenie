import { Button } from "@fluentui/react-components";
import { revealAudio } from "../../../../services/playground";
import type { SpeechOutputFile } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { toast } from "../../../../utils/toast";
import { Flex } from "../../../ui/Flex/Flex";
import { BodyStrong } from "../../../ui/Typography/Typography";
import { SavedAudioPlayer } from "../../SavedAudioPlayer/SavedAudioPlayer";

interface AudioOutputPlayerProps {
  output: SpeechOutputFile;
}

/** One file an audio to audio job saved: its label, a player and the folder it is in. */
export function AudioOutputPlayer({ output }: AudioOutputPlayerProps) {
  const reveal = () => {
    revealAudio(output.path).catch((err: unknown) => {
      toast.error("Could not open the folder", errorMessage(err));
    });
  };

  return (
    <Flex direction="column" gap="s">
      <Flex justify="between" align="center" gap="m">
        <BodyStrong>{output.label}</BodyStrong>
        <Button appearance="secondary" onClick={reveal}>
          Show in folder
        </Button>
      </Flex>
      <SavedAudioPlayer path={output.path} />
    </Flex>
  );
}
