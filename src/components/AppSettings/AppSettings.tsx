import type { UpdateInfo } from "../../types";
import CliUpdateCard from "../settings/CliUpdateCard/CliUpdateCard";
import RamHeadroomCard from "../settings/RamHeadroomCard/RamHeadroomCard";
import RuntimeVersionsCard from "../settings/RuntimeVersionsCard/RuntimeVersionsCard";
import ServerPortCard from "../settings/ServerPortCard/ServerPortCard";
import ServerRuntimeCard from "../settings/ServerRuntimeCard/ServerRuntimeCard";
import "./AppSettings.css";

interface AppSettingsProps {
  updateInfo: UpdateInfo | null;
}

/** Application & Runtime: the GenieX server port, RAM headroom and runtime settings, the CLI and runtime versions. */
export default function AppSettings({ updateInfo }: AppSettingsProps) {
  return (
    <div className="app-settings__section">
      <ServerPortCard />
      <RamHeadroomCard />
      <ServerRuntimeCard />
      <CliUpdateCard updateInfo={updateInfo} />
      <RuntimeVersionsCard />
    </div>
  );
}
