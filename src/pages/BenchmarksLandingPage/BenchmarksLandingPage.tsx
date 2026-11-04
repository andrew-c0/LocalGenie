import { DocumentRegular, PlayRegular, TasksAppRegular } from "@fluentui/react-icons";
import {
  type SectionInfoCard,
  SectionLanding,
} from "../../components/ui/SectionLanding/SectionLanding";
import { useBenchmarkCounts } from "./useBenchmarkCounts";

const INFO_CARDS: SectionInfoCard[] = [
  {
    icon: <DocumentRegular />,
    title: "Prompts and files",
    body: "Save prompts with keywords and attached files in the Prompt Library. Each saved prompt can be added as a step in a test run.",
  },
  {
    icon: <TasksAppRegular />,
    title: "Test runs",
    body: "A test run, or suite, is an ordered list of prompt steps, sent as one conversation or as independent requests.",
  },
  {
    icon: <PlayRegular />,
    title: "Run and compare",
    body: "Run starts a suite on the loaded model. Compare charts the runs ticked on Runs, or all completed runs if none is ticked.",
  },
];

/** Benchmarks landing: how a prompt becomes a test run and a saved run, then one row per page with its count. */
export default function BenchmarksLandingPage() {
  const facts = useBenchmarkCounts();
  return (
    <SectionLanding
      sectionId="benchmarks"
      title="Benchmarks"
      subtitle="Build prompts and test runs, run them on the loaded model, then compare speed and memory."
      infoCards={INFO_CARDS}
      facts={facts}
    />
  );
}
