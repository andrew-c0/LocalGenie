import CompactionCard from "../settings/CompactionCard/CompactionCard";
import RamHeadroomCard from "../settings/RamHeadroomCard/RamHeadroomCard";
import ServerPortCard from "../settings/ServerPortCard/ServerPortCard";
import ServerRuntimeCard from "../settings/ServerRuntimeCard/ServerRuntimeCard";
import "./AppSettings.css";

/** Application & Runtime: the GenieX server port, RAM headroom, conversation compaction and runtime settings. */
export default function AppSettings() {
  return (
    <div className="app-settings__section">
      <ServerPortCard />
      <RamHeadroomCard />
      <CompactionCard />
      <ServerRuntimeCard />
    </div>
  );
}
