import { AihubBrowser } from "../../components/models/AihubBrowser/AihubBrowser";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import "./AihubModelsPage.css";

/** Qualcomm AI Hub library page: the read-only catalog. Each model opens its own detail page. */
export default function AihubModelsPage() {
  return (
    <div className="aihub-models-page__page">
      <div className="aihub-models-page__inner">
        <PageHeader
          title="Qualcomm AI Hub"
          subtitle="Qualcomm AI Hub models with QAIRT assets, read from the public catalog."
        />
        <AihubBrowser />
      </div>
    </div>
  );
}
