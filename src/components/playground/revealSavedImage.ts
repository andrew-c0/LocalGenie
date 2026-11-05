import { revealImage } from "../../services/playground";
import { errorMessage } from "../../utils/errorMessage";
import { REVEAL_FAILED_TITLE } from "../../utils/playgroundText";
import { toast } from "../../utils/toast";

/** Opens the folder of a saved picture, with a toast when Explorer cannot. */
export function revealSavedImage(path: string): void {
  revealImage(path).catch((err: unknown) => {
    toast.error(REVEAL_FAILED_TITLE, errorMessage(err));
  });
}
