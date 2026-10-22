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
import { GaugeRegular, PlayCircleRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { StatusBadge } from "../components/ui/StatusBadge/StatusBadge";
import { useModelStore } from "../stores/modelStore";

const SUITE_HOME = "/prompt-benchmark/playground";

const SECTIONS: {
  to: string;
  label: string;
  desc: string;
  icon: ReactElement;
}[] = [
  {
    to: SUITE_HOME,
    label: "Prompt Benchmark",
    desc: "Fixed-prompt TTFT & throughput",
    icon: <PlayCircleRegular />,
  },
  {
    to: "/prompt-benchmark/dashboard",
    label: "Performance Dashboard",
    desc: "Chat-derived KPIs & ranking",
    icon: <GaugeRegular />,
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
    overflowY: "auto",
  },
});

/**
 * Benchmark Suite — the single benchmark destination in the app. Hosts the
 * prompt benchmark playground and the performance dashboard as nested routes,
 * mirroring the Settings page layout.
 */
export default function PromptBenchmarkPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);

  const selected = SECTIONS.find((s) => location.pathname.startsWith(s.to))?.to ?? SUITE_HOME;

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  return (
    <div className={styles.page}>
      <aside className={styles.nav}>
        <div>
          <Text weight="semibold" size={400}>
            Benchmark Suite
          </Text>
          <Text size={200} block>
            {serverStatus.running ? `runtime :${serverStatus.port}` : "runtime offline"}
          </Text>
        </div>

        <TabList
          vertical
          aria-label="Benchmark sections"
          selectedValue={selected}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.to} value={s.to} icon={s.icon}>
              <span className={styles.tabContent}>
                <Text weight="semibold">{s.label}</Text>
                <Caption1>{s.desc}</Caption1>
              </span>
            </Tab>
          ))}
        </TabList>

        <div className={styles.navFooter}>
          <Divider />
          <div className={styles.navFooterRow}>
            <div className={styles.navFooterText}>
              <Caption1>Active Model</Caption1>
              <Text>{activeModelId ? activeModelId.split("/").pop() : "none"}</Text>
            </div>
          </div>
          <StatusBadge tone={serverStatus.running ? "green" : "red"}>
            {serverStatus.running ? "Runtime Connected" : "Runtime Offline"}
          </StatusBadge>
        </div>
      </aside>

      <section className={styles.panel}>
        <Outlet />
      </section>
    </div>
  );
}
