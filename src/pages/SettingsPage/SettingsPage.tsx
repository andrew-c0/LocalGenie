import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Divider, Tab, TabList } from "@fluentui/react-components";
import {
  BrainCircuitRegular,
  DesktopRegular,
  DocumentBulletListRegular,
  InfoRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppSettings from "../../components/AppSettings/AppSettings";
import ModelSettings from "../../components/ModelSettings/ModelSettings";
import ServerLogsCard from "../../components/settings/ServerLogsCard/ServerLogsCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge/StatusBadge";
import { useModelStore } from "../../stores/modelStore";
import "./SettingsPage.css";
import { Body, BodyStrong, Meta, SectionTitle } from "../../components/ui/Typography/Typography";

type SectionId = "app" | "inference" | "logs";

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
    desc: "Server port, CLI updates",
    subtitle: "Configure the local GenieX server port and keep the GenieX CLI up to date.",
    icon: <DesktopRegular />,
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
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const updateInfo = useModelStore((s) => s.updateInfo);

  const updateBadge = updateInfo?.update_available ?? false;
  const current = SECTIONS.find((s) => s.id === section);

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    const next = SECTIONS.find((s) => s.id === data.value);
    if (next) navigate(`/settings/${next.id}`);
  };

  return (
    <div className="settings-page__page">
      <aside className="settings-page__nav">
        <div>
          <SectionTitle>System Configuration</SectionTitle>
          <Meta block>
            {serverStatus.running ? `runtime :${serverStatus.port}` : "runtime offline"}
          </Meta>
        </div>

        <TabList
          vertical
          aria-label="Settings sections"
          selectedValue={section}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.id} value={s.id} icon={s.icon}>
              <span className="settings-page__tab-content">
                <BodyStrong>{s.label}</BodyStrong>
                <Meta>{s.desc}</Meta>
              </span>
              {s.id === "app" && updateBadge && <StatusBadge tone="red">!</StatusBadge>}
            </Tab>
          ))}
        </TabList>

        <div className="settings-page__nav-footer">
          <Divider />
          <div className="settings-page__nav-footer-row">
            <InfoRegular />
            <div className="settings-page__nav-footer-text">
              <Meta>Active Model</Meta>
              <Body>{activeModelId ? activeModelId.split("/").pop() : "none"}</Body>
            </div>
          </div>
          <StatusBadge tone={serverStatus.running ? "green" : "red"}>
            {serverStatus.running ? "Runtime Connected" : "Runtime Offline"}
          </StatusBadge>
        </div>
      </aside>

      <section className="settings-page__panel">
        <PageHeader
          eyebrow="● SETTINGS"
          title={current?.label}
          subtitle={current?.subtitle}
          actions={
            <div className="settings-page__panel-actions">
              {section === "inference" && <Meta>changes persist per model</Meta>}
              {updateBadge && section === "app" && (
                <StatusBadge tone="blue">v{updateInfo?.latest_version} available</StatusBadge>
              )}
            </div>
          }
        />

        {section === "app" && <AppSettings updateInfo={updateInfo} />}
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
