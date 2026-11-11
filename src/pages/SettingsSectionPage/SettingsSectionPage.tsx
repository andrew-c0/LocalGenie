import type { ReactElement } from "react";
import AppSettings from "../../components/AppSettings/AppSettings";
import ModelSettings from "../../components/ModelSettings/ModelSettings";
import AboutSettings from "../../components/settings/AboutSettings/AboutSettings";
import RuntimesCard from "../../components/settings/RuntimesCard/RuntimesCard";
import ServerLogsCard from "../../components/settings/ServerLogsCard/ServerLogsCard";
import ToolsSettings from "../../components/settings/ToolsSettings/ToolsSettings";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { Meta } from "../../components/ui/Typography/Typography";
import { routeById } from "../../navigation/routeUtils";
import "./SettingsSectionPage.css";

/** The sub-pages of Settings, by route id. Each route in `Navigation.tsx` names one of them. */
export type SettingsRouteId =
  | "settings-app"
  | "settings-runtimes"
  | "settings-inference"
  | "settings-tools"
  | "settings-logs"
  | "settings-about";

const PANELS: Record<SettingsRouteId, { subtitle: string; panel: ReactElement }> = {
  "settings-app": {
    subtitle: "Configure the local GenieX server port, RAM headroom and conversation summaries.",
    panel: <AppSettings />,
  },
  "settings-runtimes": {
    subtitle: "Install, update and remove the GenieX CLI and the optional Playground runtimes.",
    panel: <RuntimesCard />,
  },
  "settings-inference": {
    subtitle: "Default sampling parameters and system prompt applied to every chat and benchmark.",
    panel: <ModelSettings />,
  },
  "settings-tools": {
    subtitle:
      "Tools a chat model may call, and the folders the file tools may read. All are off to start.",
    panel: <ToolsSettings />,
  },
  "settings-logs": {
    subtitle:
      "Live output from the GenieX server process, useful for diagnosing load or inference errors.",
    panel: <ServerLogsCard />,
  },
  "settings-about": {
    subtitle: "The app version, the installed runtimes, the licence and where to find the code.",
    panel: <AboutSettings />,
  },
};

/** One Settings sub-page: its title and subtitle, its panel, and the footer hint. */
export default function SettingsSectionPage({ routeId }: { routeId: SettingsRouteId }) {
  const { subtitle, panel } = PANELS[routeId];
  const title = routeById(routeId)?.title;

  return (
    <div className="settings-section__page">
      <div className="settings-section__inner">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            routeId === "settings-inference" ? <Meta>changes persist per model</Meta> : undefined
          }
        />

        {panel}

        {routeId !== "settings-about" && (
          <Meta>
            Preferences are stored locally and applied on the next server start where applicable.
          </Meta>
        )}
      </div>
    </div>
  );
}
