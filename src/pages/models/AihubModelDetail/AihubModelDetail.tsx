import { Button, Card, Spinner } from "@fluentui/react-components";
import { ArrowLeftRegular, OpenRegular } from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import { useNavigate, useParams } from "react-router-dom";
import { ModelCardPanel, ModelDetailLayout } from "../../../components/models/ModelDetailLayout";
import { ModelFacts } from "../../../components/models/ModelFacts";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Body, Meta } from "../../../components/ui/Typography/Typography";
import type { AihubAsset } from "../../../services/aihub";
import { hfFileOf } from "../../../utils/aihub";
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
  const navigate = useNavigate();
  const { detail, readme, error } = useAihubModelDetail(id);
  const eyebrow = "● QUALCOMM AI HUB MODEL";
  const backButton = (
    <Button
      appearance="secondary"
      icon={<ArrowLeftRegular />}
      onClick={() => navigate("/models/aihub")}
    >
      Back to Qualcomm AI Hub
    </Button>
  );

  if (error) {
    return (
      <ModelDetailLayout eyebrow={eyebrow} title={id} actions={backButton}>
        <ErrorBanner message={error} />
      </ModelDetailLayout>
    );
  }
  if (!detail) {
    return (
      <ModelDetailLayout eyebrow={eyebrow} title={id} actions={backButton}>
        <StateBlock icon={<Spinner size="small" />} message="Loading model…" />
      </ModelDetailLayout>
    );
  }

  const quantisation = [...new Set(detail.assets?.map((a) => a.precision))].join(", ");
  const assets = detail.assets ?? [];

  return (
    <ModelDetailLayout
      eyebrow={eyebrow}
      title={detail.name || detail.id}
      subtitle={detail.headline || undefined}
      actions={
        <div className="model-detail__actions">
          {backButton}
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

      {detail.description && (
        <Card size="small">
          <Body>{detail.description}</Body>
        </Card>
      )}

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
