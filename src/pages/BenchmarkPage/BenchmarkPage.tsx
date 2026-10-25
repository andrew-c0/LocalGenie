import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import {
  DataBarVerticalRegular,
  DocumentRegular,
  PlayRegular,
  TableRegular,
  TasksAppRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BodyStrong, Meta, SectionTitle } from "../../components/ui/Typography/Typography";
import "./BenchmarkPage.css";

const HOME = "/benchmarks/prompts";

const SECTIONS: {
  to: string;
  label: string;
  desc: string;
  icon: ReactElement;
}[] = [
  {
    to: HOME,
    label: "Prompt Library",
    desc: "Saved prompts & files",
    icon: <DocumentRegular />,
  },
  {
    to: "/benchmarks/suites",
    label: "Test Runs",
    desc: "Suites of prompt steps",
    icon: <TasksAppRegular />,
  },
  {
    to: "/benchmarks/run",
    label: "Run",
    desc: "Start a suite on the loaded model",
    icon: <PlayRegular />,
  },
  {
    to: "/benchmarks/runs",
    label: "Runs",
    desc: "Finished runs and their figures",
    icon: <TableRegular />,
  },
  {
    to: "/benchmarks/compare",
    label: "Compare",
    desc: "Charts of the selected runs",
    icon: <DataBarVerticalRegular />,
  },
];

/** Benchmarks: the prompt library and the test-run suites, as nested routes. */
export default function BenchmarkPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Match whole path segments, so /benchmarks/run does not also match /benchmarks/runs.
  const selected =
    SECTIONS.find((s) => location.pathname === s.to || location.pathname.startsWith(`${s.to}/`))
      ?.to ?? HOME;

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  return (
    <div className="benchmark-page">
      <aside className="benchmark-page__nav">
        <SectionTitle>Benchmarks</SectionTitle>

        <TabList
          vertical
          aria-label="Benchmark sections"
          selectedValue={selected}
          onTabSelect={handleTabSelect}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.to} value={s.to} icon={s.icon}>
              <span className="benchmark-page__tab-content">
                <BodyStrong>{s.label}</BodyStrong>
                <Meta>{s.desc}</Meta>
              </span>
            </Tab>
          ))}
        </TabList>
      </aside>

      <section className="benchmark-page__panel">
        <Outlet />
      </section>
    </div>
  );
}
