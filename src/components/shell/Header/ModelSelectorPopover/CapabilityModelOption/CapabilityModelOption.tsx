import {
  ModelOptionButton,
  type ModelOptionButtonProps,
} from "../ModelOptionButton/ModelOptionButton";
import { useModelCapabilityBadges } from "./useModelCapabilityBadges";

/**
 * A model row with its capability icons. Used for both loaded and installed-but-not-loaded rows, so
 * every row loads its badges the same way: once, when the row mounts.
 */
export function CapabilityModelOption(props: ModelOptionButtonProps) {
  const badges = useModelCapabilityBadges(props.model.name);
  return <ModelOptionButton {...props} badges={badges} />;
}
