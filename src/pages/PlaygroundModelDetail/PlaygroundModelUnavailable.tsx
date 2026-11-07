import { Button } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { ModelDetailLayout } from "../../components/models/ModelDetailLayout";
import type { CatalogFailure } from "../../components/models/PlaygroundModelsCatalog/usePlaygroundModelsCatalog";
import { RetryBlock } from "../../components/ui/RetryBlock/RetryBlock";
import { SkeletonBlock } from "../../components/ui/Skeletons/SkeletonBlock";
import { SkeletonRows } from "../../components/ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import type { PlaygroundDetailStatus } from "../../utils/playgroundModelDetail";

interface PlaygroundModelUnavailableProps {
  /** Anything but "ready": the page shows the state of the catalog read instead of the model. */
  status: PlaygroundDetailStatus;
  failures: CatalogFailure[];
}

/** The page while the model is not shown: the catalogs are loading, failed to read, or do not list the model. */
export function PlaygroundModelUnavailable({ status, failures }: PlaygroundModelUnavailableProps) {
  const navigate = useNavigate();

  if (status === "loading") {
    return (
      <ModelDetailLayout title="Playground model" subtitle="Reading the Playground catalogs.">
        <SkeletonBlock height={64} />
        <SkeletonRows count={3} variant="row" />
      </ModelDetailLayout>
    );
  }

  if (status === "error") {
    return (
      <ModelDetailLayout title="Playground model" subtitle="This model could not be displayed.">
        {failures.map((failure) => (
          <RetryBlock
            key={failure.kind}
            error={failure.message}
            subject="the Playground"
            onRetry={failure.retry}
          />
        ))}
      </ModelDetailLayout>
    );
  }

  return (
    <ModelDetailLayout title="Playground model">
      <StateBlock icon="⚠️" message="This model is not in the Playground catalogs.">
        <Button appearance="secondary" onClick={() => navigate("/models/playground")}>
          Back to Playground models
        </Button>
      </StateBlock>
    </ModelDetailLayout>
  );
}
