import { ArrowDownloadRegular, RamRegular, ServerRegular } from "@fluentui/react-icons";
import {
  type SectionInfoCard,
  SectionLanding,
} from "../../components/ui/SectionLanding/SectionLanding";
import { useModelStore } from "../../stores/modelStore";

const INFO_CARDS: SectionInfoCard[] = [
  {
    icon: <ArrowDownloadRegular />,
    title: "Where models come from",
    body: "Hugging Face GGUF files and Qualcomm AI Hub assets are downloaded to this device, then imported into GenieX from local files.",
  },
  {
    icon: <ServerRegular />,
    title: "What runs where",
    body: "Chat and OCR run on the GenieX server. Playground image and speech models run in optional runtimes, installed from Settings > Runtimes.",
  },
  {
    icon: <RamRegular />,
    title: "RAM fit",
    body: "Each card shows a RAM badge (Fits, Tight or May not fit), estimated from the model size against this PC's memory. It is an estimate.",
  },
];

/** Models landing: where models come from and what runs where, then one row per library page. */
export default function ModelsLandingPage() {
  const installedCount = useModelStore((s) => s.models.length);
  return (
    <SectionLanding
      sectionId="models"
      title="Models"
      subtitle="Find, download and manage the models GenieX runs on this device."
      infoCards={INFO_CARDS}
      facts={{ "models-local": `${installedCount} installed` }}
    />
  );
}
