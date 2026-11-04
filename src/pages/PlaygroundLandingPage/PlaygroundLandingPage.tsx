import { ArrowDownloadRegular, CubeRegular, DesktopRegular } from "@fluentui/react-icons";
import {
  type SectionInfoCard,
  SectionLanding,
} from "../../components/ui/SectionLanding/SectionLanding";
import { usePlaygroundCounts } from "./usePlaygroundCounts";

const INFO_CARDS: SectionInfoCard[] = [
  {
    icon: <DesktopRegular />,
    title: "Where the tools run",
    body: "Image models run in stable-diffusion.cpp. Speech and audio models run in sherpa-onnx, on the CPU only.",
  },
  {
    icon: <CubeRegular />,
    title: "Optional runtimes",
    body: "stable-diffusion.cpp and sherpa-onnx are optional runtimes. Install them from Settings > Runtimes. A tool stays locked, with the reason shown, until its runtime is installed.",
  },
  {
    icon: <ArrowDownloadRegular />,
    title: "Models and OCR",
    body: "OCR runs on the GenieX server, so it needs the GenieX CLI. Each tool downloads its models from inside the tool, with no separate step.",
  },
];

/** Playground landing: what the tools run on, then one row per tool with the models it has installed. */
export default function PlaygroundLandingPage() {
  const facts = usePlaygroundCounts();
  return (
    <SectionLanding
      sectionId="playground"
      title="Playground"
      subtitle="Try models that do more than chat, one tool at a time."
      infoCards={INFO_CARDS}
      facts={facts}
    />
  );
}
