import { revealImage } from "../../../services/playground";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { UPSCALE_REVEAL_FAILED_TITLE } from "../../../utils/upscaleText";

/** Opens the folder of a saved upscaled picture, with a toast when Explorer cannot. */
export function revealUpscaled(path: string): void {
  revealImage(path).catch((err: unknown) => {
    toast.error(UPSCALE_REVEAL_FAILED_TITLE, errorMessage(err));
  });
}
