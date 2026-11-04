import { useMemo } from "react";
import HubModelBrowser from "../../components/models/HubModelBrowser/HubModelBrowser";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import "./HubModelsPage.css";

/** Hugging Face library page: search and filters, with downloads started from its cards. */
export default function HubModelsPage() {
  const downloads = useDownloadStore((s) => s.downloads);
  const activeIds = useMemo(
    () => new Set(downloads.filter((d) => isDownloadActive(d.status)).map((d) => d.id)),
    [downloads],
  );

  return (
    <div className="hub-models-page__page">
      <div className="hub-models-page__inner">
        <PageHeader
          title="Hugging Face"
          subtitle="Search Hugging Face for GGUF models and download them to this device."
        />
        <HubModelBrowser downloading={activeIds} />
      </div>
    </div>
  );
}
