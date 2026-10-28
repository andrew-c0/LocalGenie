import { Button, Spinner } from "@fluentui/react-components";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { ExternalLink } from "../../../components/ui/ExternalLink/ExternalLink";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Body, BodyStrong, Meta, SectionTitle } from "../../../components/ui/Typography/Typography";
import type { AihubModelDetail as AihubModel } from "../../../services/aihub";
import { humanLabel } from "../../../utils/aihub";
import { AihubAssetList } from "./AihubAssetList";
import "./AihubModelDetail.css";
import { useAihubModelDetail } from "./useAihubModelDetail";

/** Phase 1 read-only detail of a Qualcomm AI Hub model: info, QAIRT assets and model card. */
export default function AihubModelDetail() {
  const { id = "" } = useParams<{ id: string }>();
  // Keyed by id so switching models starts from a clean state.
  return <AihubModelDetailView key={id} id={id} />;
}

function AihubModelDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const { detail, readme, error } = useAihubModelDetail(id);

  return (
    <div className="aihub-detail__page">
      <Flex direction="column" gap="m" className="aihub-detail__inner">
        <Flex>
          <Button
            appearance="secondary"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate("/models/aihub")}
          >
            Qualcomm AI Hub
          </Button>
        </Flex>

        {error && <ErrorBanner message={error} />}
        {!detail && !error && (
          <StateBlock icon={<Spinner size="small" />} message="Loading model…" />
        )}

        {detail && <ModelContent model={detail} readme={readme} />}
      </Flex>
    </div>
  );
}

function ModelContent({ model, readme }: { model: AihubModel; readme: string | null | undefined }) {
  const info: [string, string][] = [
    ["Domain", model.domain],
    ["Use case", model.useCase],
    ["Licence", model.licenseType],
    ["Call to action", model.callToAction ?? ""],
  ]
    .filter(([, value]) => value !== "")
    .map(([label, value]) => [label, humanLabel(value)]);

  return (
    <>
      <PageHeader
        eyebrow={model.domain ? humanLabel(model.domain) : undefined}
        title={model.name || model.id}
        subtitle={model.headline || undefined}
      />

      {model.restrictModelSharing && (
        <Flex gap="s" align="center">
          <StatusBadge tone="red">Sharing restricted</StatusBadge>
          <Meta>The model's assets should not be redistributed.</Meta>
        </Flex>
      )}

      <Flex direction="column" gap="xs">
        {info.map(([label, value]) => (
          <Flex key={label} gap="s" align="baseline">
            <Meta>{label}</Meta>
            <BodyStrong>{value}</BodyStrong>
          </Flex>
        ))}
        {model.licenseUrl && (
          <Flex gap="s" align="baseline">
            <Meta>Licence link</Meta>
            <ExternalLink url={model.licenseUrl} />
          </Flex>
        )}
        {model.sourceRepo && (
          <Flex gap="s" align="baseline">
            <Meta>Source repo</Meta>
            <ExternalLink url={model.sourceRepo} />
          </Flex>
        )}
      </Flex>

      {model.description && <Body>{model.description}</Body>}

      <SectionTitle>QAIRT assets</SectionTitle>
      <AihubAssetList model={model} />

      <SectionTitle>Model card</SectionTitle>
      {readme === undefined ? (
        <Meta>Loading model card…</Meta>
      ) : readme === null ? (
        <Meta>No model card available for this model.</Meta>
      ) : (
        <MarkdownContent>{readme}</MarkdownContent>
      )}
    </>
  );
}
