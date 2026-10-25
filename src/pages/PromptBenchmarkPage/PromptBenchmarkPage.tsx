import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import { GaugeRegular, PlayCircleRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import "./PromptBenchmarkPage.css";
import { BodyStrong, Meta, SectionTitle } from "../../components/ui/Typography/Typography";

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

/**
 * Benchmark Suite — the single benchmark destination in the app. Hosts the
 * prompt benchmark playground and the performance dashboard as nested routes,
 * mirroring the Settings page layout.
 */
export default function PromptBenchmarkPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const selected = SECTIONS.find((s) => location.pathname.startsWith(s.to))?.to ?? SUITE_HOME;

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  return (
    <div className="prompt-benchmark-page__page">
      <aside className="prompt-benchmark-page__nav">
        <SectionTitle>Benchmark Suite</SectionTitle>

        <TabList
          vertical
          aria-label="Benchmark sections"
          selectedValue={selected}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.to} value={s.to} icon={s.icon}>
              <span className="prompt-benchmark-page__tab-content">
                <BodyStrong>{s.label}</BodyStrong>
                <Meta>{s.desc}</Meta>
              </span>
            </Tab>
          ))}
        </TabList>
      </aside>

      <section className="prompt-benchmark-page__panel">
        <Outlet />
      </section>
    </div>
  );
}
