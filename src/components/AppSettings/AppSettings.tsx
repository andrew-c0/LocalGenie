import AppUpdateCard from "../settings/AppUpdateCard/AppUpdateCard";
import BackgroundCard from "../settings/BackgroundCard/BackgroundCard";
import CompactionCard from "../settings/CompactionCard/CompactionCard";
import DispatchSamplingCard from "../settings/DispatchSamplingCard/DispatchSamplingCard";
import RamHeadroomCard from "../settings/RamHeadroomCard/RamHeadroomCard";
import RuntimeUpdateNoticeCard from "../settings/RuntimeUpdateNoticeCard/RuntimeUpdateNoticeCard";
import ServerPortCard from "../settings/ServerPortCard/ServerPortCard";
import ServerRuntimeCard from "../settings/ServerRuntimeCard/ServerRuntimeCard";
import StorageCard from "../settings/StorageCard/StorageCard";
import "./AppSettings.css";

/** Application & Runtime: app updates, the GenieX server port, RAM headroom, conversation compaction, runtime update notices, runtime settings, the Dispatch sampling profile and storage. */
export default function AppSettings() {
  return (
    <div className="app-settings__section">
      <AppUpdateCard />
      <BackgroundCard />
      <ServerPortCard />
      <RamHeadroomCard />
      <CompactionCard />
      <RuntimeUpdateNoticeCard />
      <ServerRuntimeCard />
      <DispatchSamplingCard />
      <StorageCard />
    </div>
  );
}
