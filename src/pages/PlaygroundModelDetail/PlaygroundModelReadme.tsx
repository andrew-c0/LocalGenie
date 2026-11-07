import type { ReactNode } from "react";
import { ModelCardPanel } from "../../components/models/ModelDetailLayout";
import { ExternalLink } from "../../components/ui/ExternalLink/ExternalLink";
import { Flex } from "../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../components/ui/MarkdownContent/MarkdownContent";
import { RetryBlock } from "../../components/ui/RetryBlock/RetryBlock";
import { SkeletonLines } from "../../components/ui/Skeletons/SkeletonLines";
import { Body } from "../../components/ui/Typography/Typography";
import type { AsyncData } from "../../hooks/useAsyncData";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchHubModelReadme, hubModelPageUrl } from "../../services/hubApi";
import { stripFrontMatter } from "../../utils/modelCard";

interface PlaygroundModelReadmeProps {
  /** The Hugging Face repo whose README is the model card, or null when none is published. */
  cardRepo: string | null;
  /** The model's source page, linked when there is no card. */
  sourceUrl: string;
}

/** The model card body: the README of the repo, with its own loading and retry. */
function readmeBody(repo: string, readme: AsyncData<string | null>): ReactNode {
  if (readme.status === "loading") return <SkeletonLines lines={6} />;
  if (readme.status === "error") {
    return (
      <RetryBlock compact error={readme.error} subject="Hugging Face" onRetry={readme.retry} />
    );
  }
  // A repo with no README (404) is ready with no content: the card says so and links the repo.
  if (readme.data === null) {
    return (
      <Flex direction="column" gap="xs">
        <Body>This model's Hugging Face repo has no README.</Body>
        <ExternalLink url={hubModelPageUrl(repo)}>Open the repo on Hugging Face</ExternalLink>
      </Flex>
    );
  }
  return (
    <MarkdownContent allowHtml repoId={repo}>
      {stripFrontMatter(readme.data)}
    </MarkdownContent>
  );
}

/**
 * The model card of a Playground model: the README of its Hugging Face repo, read when the page opens. A model
 * with no card repo says so and links its source page instead.
 */
export function PlaygroundModelReadme({ cardRepo, sourceUrl }: PlaygroundModelReadmeProps) {
  const readme = useAsyncData(cardRepo, fetchHubModelReadme);

  if (cardRepo === null) {
    return (
      <ModelCardPanel>
        <Flex direction="column" gap="xs">
          <Body>No model card is published for this model.</Body>
          <ExternalLink url={sourceUrl}>Open the source page</ExternalLink>
        </Flex>
      </ModelCardPanel>
    );
  }
  return <ModelCardPanel>{readmeBody(cardRepo, readme)}</ModelCardPanel>;
}
