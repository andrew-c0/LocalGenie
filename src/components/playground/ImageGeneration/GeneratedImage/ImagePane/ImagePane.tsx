import { Spinner } from "@fluentui/react-components";
import { ErrorBanner } from "../../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../../ui/Flex/Flex";
import { Meta } from "../../../../ui/Typography/Typography";
import "./ImagePane.css";

interface ImagePaneProps {
  /** Names the picture above it, e.g. "Input". Left out when the picture stands alone. */
  label?: string;
  alt: string;
  dataUrl: string | null;
  error: string | null;
  isLoading: boolean;
}

/** One saved picture, with its label, a spinner while it loads, or the reason it cannot be shown. */
export function ImagePane({ label, alt, dataUrl, error, isLoading }: ImagePaneProps) {
  return (
    <Flex direction="column" gap="xs" className="image-pane">
      {label && <Meta>{label}</Meta>}
      {error && <ErrorBanner message={error} />}
      {isLoading && <Spinner label="Opening the image…" />}
      {dataUrl && <img className="image-pane__image" src={dataUrl} alt={alt} />}
    </Flex>
  );
}
