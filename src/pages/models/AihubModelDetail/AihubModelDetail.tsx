import { Button, Card } from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { CapabilitiesSection } from "../../../components/models/CapabilitiesSection";
import { ModelCardPanel, ModelDetailLayout } from "../../../components/models/ModelDetailLayout";
import { ModelFacts } from "../../../components/models/ModelFacts";
import { ModelSpecSection } from "../../../components/models/ModelSpecSection/ModelSpecSection";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { RetryBlock } from "../../../components/ui/RetryBlock/RetryBlock";
import { SkeletonBlock } from "../../../components/ui/Skeletons/SkeletonBlock";
import { SkeletonLines } from "../../../components/ui/Skeletons/SkeletonLines";
import { SkeletonRows } from "../../../components/ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Meta } from "../../../components/ui/Typography/Typography";
import type { AsyncData } from "../../../hooks/useAsyncData";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import type { AihubAsset } from "../../../services/aihub";
import { aihubDetailCapabilityBadges, hfFileOf } from "../../../utils/aihub";
import { aihubCompatibilityCells, aihubSpecCells } from "../../../utils/modelSpecs";
import { SERVICE_NAMES } from "../../../utils/networkError";
import { AihubAboutSection } from "./AihubAboutSection/AihubAboutSection";
import { AihubAssetPicker } from "./AihubAssetPicker";
import { useAihubModelDetail } from "./useAihubModelDetail";

/** Shown on the assets card when the release assets could not be read. Not a network text, so it shows as written. */
const ASSETS_UNAVAILABLE = "Could not read this model's assets from Qualcomm AI Hub.";

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

/** The model card panel's body: a skeleton while it loads, a retry for a failed read, else the text. */
function readmeBody(readme: AsyncData<string | null>): ReactNode {
  if (readme.status === "loading") return <SkeletonLines lines={6} />;
  if (readme.status === "error") {
    return (
      <RetryBlock
        compact
        error={readme.error}
        subject={SERVICE_NAMES.aihub}
        onRetry={readme.retry}
      />
    );
  }
  // The Hub has no card (null): the panel says so.
  return readme.data ? <MarkdownContent>{readme.data}</MarkdownContent> : undefined;
}

function AihubModelDetailView({ id }: { id: string }) {
  const { detail: detailLoad, readme } = useAihubModelDetail(id);
  const detail = detailLoad.data;
  // The trail's last crumb shows the model's name; until it loads, the id from the URL.
  useBreadcrumbLabel(detail?.name || null);

  if (detailLoad.status === "error") {
    return (
      <ModelDetailLayout title={id} subtitle="This model could not be displayed.">
        <RetryBlock
          error={detailLoad.error}
          subject={SERVICE_NAMES.aihub}
          onRetry={detailLoad.retry}
        />
      </ModelDetailLayout>
    );
  }
  if (!detail) {
    return (
      <ModelDetailLayout title={id}>
        <SkeletonBlock height={120} />
        <SkeletonRows count={3} variant="row" />
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
          <RetryBlock
            compact
            error={ASSETS_UNAVAILABLE}
            subject={SERVICE_NAMES.aihub}
            onRetry={detailLoad.retry}
          />
        ) : assets.length === 0 ? (
          <StateBlock icon="📦" message="No QAIRT assets for this model." />
        ) : (
          <AihubAssetPicker model={detail} assets={assets} />
        )}
      </Card>

      <ModelCardPanel>{readmeBody(readme)}</ModelCardPanel>
    </ModelDetailLayout>
  );
}
