import { ArrowDownloadRegular, RamRegular, ServerRegular } from "@fluentui/react-icons";
import { usePlaygroundStoredCatalogs } from "../../components/models/usePlaygroundStoredCatalogs";
import { usePlaygroundCatalogs } from "../../components/playground/usePlaygroundCatalogs";
import {
  type SectionInfoCard,
  SectionLanding,
} from "../../components/ui/SectionLanding/SectionLanding";
import { useModelStore } from "../../stores/modelStore";
import { playgroundModelsFactOf } from "../../utils/playgroundModelsCatalog";

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

/**
 * Models landing: where models come from and what runs where, then one row per library page. The GenieX
 * row counts the GenieX models; the Playground models row counts the installed Playground models out of
 * every curated one. The Playground catalogs are read here so the count is known on arrival.
 */
export default function ModelsLandingPage() {
  const genieCount = useModelStore((s) => s.models.length);
  usePlaygroundCatalogs();
  const playgroundFact = playgroundModelsFactOf(usePlaygroundStoredCatalogs());
  return (
    <SectionLanding
      sectionId="models"
      title="Models"
      subtitle="Find, download and manage the models GenieX runs on this device."
      infoCards={INFO_CARDS}
      facts={{
        "models-local": `${genieCount} installed`,
        "models-playground": playgroundFact,
      }}
    />
  );
}
