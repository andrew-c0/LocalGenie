import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList, Tooltip } from "@fluentui/react-components";
import {
  BrainCircuitRegular,
  CubeRegular,
  DesktopRegular,
  DocumentBulletListRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppSettings from "../../components/AppSettings/AppSettings";
import ModelSettings from "../../components/ModelSettings/ModelSettings";
import RuntimesCard from "../../components/settings/RuntimesCard/RuntimesCard";
import ServerLogsCard from "../../components/settings/ServerLogsCard/ServerLogsCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { useModelStore } from "../../stores/modelStore";
import { useRuntimeStore } from "../../stores/runtimeStore";
import "./SettingsPage.css";
import { BodyStrong, Meta, SectionTitle } from "../../components/ui/Typography/Typography";

type SectionId = "app" | "runtimes" | "inference" | "logs";

const SECTIONS: {
  id: SectionId;
  label: string;
  desc: string;
  subtitle: string;
  icon: ReactElement;
}[] = [
  {
    id: "app",
    label: "Application & Runtime",
    desc: "Server port, RAM, summaries",
    subtitle: "Configure the local GenieX server port, RAM headroom and conversation summaries.",
    icon: <DesktopRegular />,
  },
  {
    id: "runtimes",
    label: "Runtimes",
    desc: "GenieX CLI and optional engines",
    subtitle: "Install, update and remove the GenieX CLI and the optional Playground runtimes.",
    icon: <CubeRegular />,
  },
  {
    id: "inference",
    label: "Inference & Sampling",
    desc: "Model parameters, system prompt",
    subtitle: "Default sampling parameters and system prompt applied to every chat and benchmark.",
    icon: <BrainCircuitRegular />,
  },
  {
    id: "logs",
    label: "Logs",
    desc: "GenieX server output",
    subtitle:
      "Live output from the GenieX server process, useful for diagnosing load or inference errors.",
    icon: <DocumentBulletListRegular />,
  },
];

/** Settings page: section sub-menu on the left, focused section panel on the right. */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section: string }>();
  // Unknown sections fall back to the first one.
  const section: SectionId = SECTIONS.find((s) => s.id === sectionParam)?.id ?? "app";
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const updatesById = useRuntimeStore((s) => s.updatesById);
  // The Runtimes tab is flagged when the CLI is missing or any runtime has an update.
  const anyUpdate = Object.values(updatesById).some((update) => update.updateAvailable);
  // What the warning beside the Runtimes label says; null when there is nothing to flag.
  const runtimesWarning =
    cliInstalled === false
      ? "The GenieX CLI is not installed."
      : anyUpdate
        ? "A runtime update is available."
        : null;
  const current = SECTIONS.find((s) => s.id === section);

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    const next = SECTIONS.find((s) => s.id === data.value);
    if (next) navigate(`/settings/${next.id}`);
  };

  return (
    <div className="settings-page__page">
      <aside className="settings-page__nav">
        <SectionTitle>System Configuration</SectionTitle>

        <TabList
          vertical
          aria-label="Settings sections"
          selectedValue={section}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.id} value={s.id} icon={s.icon}>
              <span className="settings-page__tab-content">
                <span className="settings-page__tab-label">
                  <BodyStrong>{s.label}</BodyStrong>
                  {s.id === "runtimes" && runtimesWarning && (
                    <Tooltip content={runtimesWarning} relationship="label">
                      <WarningRegular className="settings-page__tab-warning" />
                    </Tooltip>
                  )}
                </span>
                <Meta>{s.desc}</Meta>
              </span>
            </Tab>
          ))}
        </TabList>
      </aside>

      <section className="settings-page__panel">
        <PageHeader
          eyebrow="● SETTINGS"
          title={current?.label}
          subtitle={current?.subtitle}
          actions={
            <div className="settings-page__panel-actions">
              {section === "inference" && <Meta>changes persist per model</Meta>}
            </div>
          }
        />

        {section === "app" && <AppSettings />}
        {section === "runtimes" && <RuntimesCard />}
        {section === "inference" && <ModelSettings />}
        {section === "logs" && <ServerLogsCard />}

        <div className="settings-page__panel-footer">
          <Meta>
            Preferences are stored locally and applied on the next server start where applicable.
          </Meta>
        </div>
      </section>
    </div>
  );
}
