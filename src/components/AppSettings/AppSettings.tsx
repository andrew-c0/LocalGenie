import type { UpdateInfo } from "../../types";
import CliUpdateCard from "../settings/CliUpdateCard/CliUpdateCard";
import RuntimeVersionsCard from "../settings/RuntimeVersionsCard/RuntimeVersionsCard";
import ServerPortCard from "../settings/ServerPortCard/ServerPortCard";
import ServerRuntimeCard from "../settings/ServerRuntimeCard/ServerRuntimeCard";
import "./AppSettings.css";

interface AppSettingsProps {
  updateInfo: UpdateInfo | null;
}

/** Application & Runtime: the GenieX server port and runtime settings, the CLI and runtime versions. */
export default function AppSettings({ updateInfo }: AppSettingsProps) {
  return (
    <div className="app-settings__section">
      <ServerPortCard />
      <ServerRuntimeCard />
      <CliUpdateCard updateInfo={updateInfo} />
      <RuntimeVersionsCard />
    </div>
  );
}
