import { Button } from "@fluentui/react-components";
import { ArrowClockwiseRegular, ErrorCircleRegular, WifiOffRegular } from "@fluentui/react-icons";
import { useRetryWhenOnline } from "../../../hooks/useOnlineStatus";
import { classifyNetworkError, networkErrorMessage } from "../../../utils/networkError";
import { Flex } from "../Flex/Flex";
import { StateBlock } from "../StateBlock/StateBlock";
import { Meta } from "../Typography/Typography";
import "./RetryBlock.css";

interface RetryBlockProps {
  /** The failure: a string from a Tauri command, an Error, or any thrown value. */
  error: unknown;
  /** The service that failed, named in the message, for example "Hugging Face". */
  subject: string;
  /** Runs the failed load again. Also called once when the browser comes back online. */
  onRetry: () => void;
  /** One line with a small button, for a card, a section or a list footer. */
  compact?: boolean;
  /** A sentence put before the message, for example "Could not check for updates.". */
  lead?: string;
}

/**
 * The error state of a cloud read. The full form is a StateBlock (icon, friendly message, Try
 * again); the compact form is one line of text and a button. The message is chosen by
 * `networkErrorMessage`: offline, rate limited, timed out, or the original error text.
 * It retries by itself when the connection returns.
 */
export function RetryBlock({ error, subject, onRetry, compact = false, lead }: RetryBlockProps) {
  useRetryWhenOnline(true, onRetry);

  const friendly = networkErrorMessage(error, subject);
  const message = lead ? `${lead} ${friendly}` : friendly;

  if (compact) {
    return (
      <Flex role="alert" align="center" gap="s" wrap className="retry-block__compact">
        <Meta>{message}</Meta>
        <Button size="small" appearance="secondary" onClick={onRetry}>
          Try again
        </Button>
      </Flex>
    );
  }

  const Icon = classifyNetworkError(error) === "offline" ? WifiOffRegular : ErrorCircleRegular;
  return (
    <div role="alert" className="retry-block__full">
      <StateBlock icon={<Icon />} message={message}>
        <Button appearance="secondary" icon={<ArrowClockwiseRegular />} onClick={onRetry}>
          Try again
        </Button>
      </StateBlock>
    </div>
  );
}
