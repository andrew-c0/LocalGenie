import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import {
  Caption1,
  Divider,
  makeStyles,
  Tab,
  TabList,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  BrainCircuitRegular,
  DesktopRegular,
  DocumentBulletListRegular,
  InfoRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppSettings from "../components/AppSettings";
import ModelSettings from "../components/ModelSettings";
import ServerLogsCard from "../components/settings/ServerLogsCard";
import { PageHeader } from "../components/ui/PageHeader/PageHeader";
import { StatusBadge } from "../components/ui/StatusBadge/StatusBadge";
import { useModelStore } from "../stores/modelStore";

type SectionId = "app" | "inference" | "logs";

const SECTIONS: {
  id: SectionId;
  label: string;
  desc: string;
  icon: ReactElement;
}[] = [
  {
    id: "app",
    label: "Application & Runtime",
    desc: "Server port, CLI updates",
    icon: <DesktopRegular />,
  },
  {
    id: "inference",
    label: "Inference & Sampling",
    desc: "Model parameters, system prompt",
    icon: <BrainCircuitRegular />,
  },
  {
    id: "logs",
    label: "Logs",
    desc: "GenieX server output",
    icon: <DocumentBulletListRegular />,
  },
];

const useStyles = makeStyles({
  page: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    gap: tokens.spacingHorizontalL,
    padding: tokens.spacingHorizontalL,
  },
  nav: {
    width: "280px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  navFooter: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginTop: "auto",
  },
  navFooterRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
  },
  navFooterText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  tabContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  panel: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    overflowY: "auto",
  },
  panelActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  panelFooter: {
    marginTop: "auto",
  },
});

/** Settings page: section sub-menu on the left, focused section panel on the right. */
export default function SettingsPage() {
  const styles = useStyles();
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
    <div className={styles.page}>
      <aside className={styles.nav}>
        <div>
          <Text weight="semibold" size={400}>
            System Configuration
          </Text>
          <Text font="monospace" size={200} block>
            {serverStatus.running ? `runtime :${serverStatus.port}` : "runtime offline"}
          </Text>
        </div>

        <TabList
          vertical
          aria-label="Settings sections"
          selectedValue={section}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.id} value={s.id} icon={s.icon}>
              <span className={styles.tabContent}>
                <Text weight="semibold">{s.label}</Text>
                <Caption1>{s.desc}</Caption1>
              </span>
              {s.id === "app" && updateBadge && <StatusBadge tone="red">!</StatusBadge>}
            </Tab>
          ))}
        </TabList>

        <div className={styles.navFooter}>
          <Divider />
          <div className={styles.navFooterRow}>
            <InfoRegular />
            <div className={styles.navFooterText}>
              <Caption1>Active Model</Caption1>
              <Text font="monospace">
                {activeModelId ? activeModelId.split("/").pop() : "none"}
              </Text>
            </div>
          </div>
          <StatusBadge tone={serverStatus.running ? "green" : "red"}>
            {serverStatus.running ? "Runtime Connected" : "Runtime Offline"}
          </StatusBadge>
        </div>
      </aside>

      <section className={styles.panel}>
        <PageHeader
          eyebrow="● SETTINGS"
          title={current?.label}
          actions={
            <div className={styles.panelActions}>
              {section === "inference" && (
                <Text font="monospace" size={200}>
                  changes persist per model
                </Text>
              )}
              {updateBadge && section === "app" && (
                <StatusBadge tone="blue">v{updateInfo?.latest_version} available</StatusBadge>
              )}
            </div>
          }
        />

        {section === "app" && <AppSettings updateInfo={updateInfo} />}
        {section === "inference" && <ModelSettings />}
        {section === "logs" && <ServerLogsCard />}

        <div className={styles.panelFooter}>
          <Caption1>
            Preferences are stored locally and applied on the next server start where applicable.
          </Caption1>
        </div>
      </section>
    </div>
  );
}
