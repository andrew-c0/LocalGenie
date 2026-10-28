import type { capabilityMap } from "../../../utils/capabilityStatus";
import type { SettingsAction } from "../../../utils/settingsButtons";

/** The scan results for one model, keyed by capability. */
export type CapabilityMap = ReturnType<typeof capabilityMap>;

/** Why a load or speculation setting is disabled for this model. Unset when it can be changed. */
export interface SettingReasons {
  compute?: string;
  nctx?: string;
  ngl?: string;
  spec?: string;
  draftModel?: string;
}

/** Shared state of the settings action buttons. */
export interface ActionState {
  /** The save that is running, if any. Its button shows a spinner. */
  pending: SettingsAction | null;
  /** True while a save or scan waits; only Cancel stays enabled during a scan. */
  blocked: boolean;
  runAction: Record<SettingsAction, () => void>;
}
