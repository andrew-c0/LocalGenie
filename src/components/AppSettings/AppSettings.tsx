import type { UpdateInfo } from "../../types";
import CliUpdateCard from "../settings/CliUpdateCard/CliUpdateCard";
import ServerPortCard from "../settings/ServerPortCard/ServerPortCard";
import "./AppSettings.css";

interface AppSettingsProps {
  updateInfo: UpdateInfo | null;
}

/** Settings sections: the GenieX server port and the GenieX CLI version. */
export default function AppSettings({ updateInfo }: AppSettingsProps) {
  return (
    <div className="app-settings__section">
      <ServerPortCard />
      <CliUpdateCard updateInfo={updateInfo} />
    </div>
  );
}
