import { Button, Card, Spinner } from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import { useParams } from "react-router-dom";
import { CapabilitiesSection } from "../../../components/models/CapabilitiesSection";
import { ModelCardPanel, ModelDetailLayout } from "../../../components/models/ModelDetailLayout";
import { ModelFacts } from "../../../components/models/ModelFacts";
import { ModelSpecSection } from "../../../components/models/ModelSpecSection/ModelSpecSection";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Meta } from "../../../components/ui/Typography/Typography";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import type { AihubAsset } from "../../../services/aihub";
import { aihubDetailCapabilityBadges, hfFileOf } from "../../../utils/aihub";
import { aihubCompatibilityCells, aihubSpecCells } from "../../../utils/modelSpecs";
import { AihubAboutSection } from "./AihubAboutSection/AihubAboutSection";
import { AihubAssetPicker } from "./AihubAssetPicker";
import { useAihubModelDetail } from "./useAihubModelDetail";

/** Detail of a Qualcomm AI Hub model: facts, QAIRT assets to download, and the model card. */
export default function AihubModelDetail() {
  const { id = "" } = useParams<{ id: string }>();
  // Keyed by id so switching models starts from a clean state.
  return <AihubModelDetailView key={id} id={id} />;
}

/** The runtime libraries among a model's assets: QAIRT for zips, GGUF for Hugging Face files. */
function libraryOf(assets: AihubAsset[]): string | null {
  const gguf = assets.some((a) => hfFileOf(a.downloadUrl) !== null);
  const zip = assets.some((a) => hfFileOf(a.downloadUrl) === null);
  if (gguf && zip) return "QAIRT, GGUF";
  if (gguf) return "GGUF";
  return zip ? "QAIRT" : null;
}

function openLink(url: string) {
  open(url).catch((err) => console.error("Failed to open browser:", err));
}

function AihubModelDetailView({ id }: { id: string }) {
  const { detail, readme, error } = useAihubModelDetail(id);
  // The trail's last crumb shows the model's name; until it loads, the id from the URL.
  useBreadcrumbLabel(detail?.name || null);

  if (error) {
    return (
      <ModelDetailLayout title={id}>
        <ErrorBanner message={error} />
      </ModelDetailLayout>
    );
  }
  if (!detail) {
    return (
      <ModelDetailLayout title={id}>
        <StateBlock icon={<Spinner size="small" />} message="Loading model…" />
      </ModelDetailLayout>
    );
  }

  const quantisation = [...new Set(detail.assets?.map((a) => a.precision))].join(", ");
  const assets = detail.assets ?? [];

  return (
    <ModelDetailLayout
      title={detail.name || detail.id}
      subtitle={detail.headline || undefined}
      actions={
        <div className="model-detail__actions">
          {detail.licenseUrl && (
            <Button
              appearance="secondary"
              icon={<OpenRegular />}
              onClick={() => openLink(detail.licenseUrl ?? "")}
            >
              Open licence
            </Button>
          )}
          {detail.sourceRepo && (
            <Button
              appearance="secondary"
              icon={<OpenRegular />}
              onClick={() => openLink(detail.sourceRepo ?? "")}
            >
              Open source repo
            </Button>
          )}
        </div>
      }
    >
      {detail.restrictModelSharing && (
        <Flex gap="s" align="center">
          <StatusBadge tone="red">Sharing restricted</StatusBadge>
          <Meta>The model's assets should not be redistributed.</Meta>
        </Flex>
      )}

      <Card size="small">
        <ModelFacts
          facts={[
            // The catalog has no task or parameter count, so those facts are N/A.
            { label: "Task", value: null },
            { label: "Parameters", value: null },
            { label: "Library", value: libraryOf(assets) },
            { label: "License", value: detail.licenseType },
            { label: "Model tree", value: null },
            { label: "Quantisation", value: quantisation },
          ]}
        />
      </Card>

      <CapabilitiesSection
        badges={aihubDetailCapabilityBadges(detail)}
        cells={aihubCompatibilityCells(detail)}
      />
      <ModelSpecSection title="Specifications" cells={aihubSpecCells(detail)} />
      <AihubAboutSection detail={detail} />

      <Card size="small">
        {detail.assets === null ? (
          <StateBlock icon="⚠️" message="Assets unavailable" />
        ) : assets.length === 0 ? (
          <StateBlock icon="📦" message="No QAIRT assets for this model." />
        ) : (
          <AihubAssetPicker model={detail} assets={assets} />
        )}
      </Card>

      <ModelCardPanel>
        {readme === undefined ? (
          <Meta>Loading model card…</Meta>
        ) : readme === null ? undefined : (
          <MarkdownContent>{readme}</MarkdownContent>
        )}
      </ModelCardPanel>
    </ModelDetailLayout>
  );
}
