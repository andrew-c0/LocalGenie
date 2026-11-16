import { Button, Spinner } from "@fluentui/react-components";
import { useDispatchStore } from "../../../stores/dispatchStore";
import { dispatchLoadStateOf } from "../../../utils/dispatchLoad";
import { errorMessage } from "../../../utils/errorMessage";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";

/**
 * The Dispatch conversations while they are not loaded: a spinner while the read runs, or the error with a Try
 * again button. Renders nothing once they are loaded. The conversations are stored locally, so there is no skeleton.
 */
export function DispatchLoadStatus() {
  const loaded = useDispatchStore((s) => s.loaded);
  const loadError = useDispatchStore((s) => s.loadError);
  const load = useDispatchStore((s) => s.load);

  switch (dispatchLoadStateOf(loaded, loadError)) {
    case "ready":
      return null;
    case "failed":
      return (
        <Flex direction="column" gap="s">
          <ErrorBanner
            message={`Could not load the Dispatch conversations. ${errorMessage(loadError)}`}
          />
          <Button appearance="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </Flex>
      );
    case "loading":
      return (
        <Flex align="center" gap="s">
          <Spinner size="tiny" />
          <Meta>Loading conversations…</Meta>
        </Flex>
      );
  }
}
