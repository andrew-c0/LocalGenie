import { useDispatchResumeOffer } from "../../hooks/useDispatchResumeOffer";
import { continueInterrupted, stopInterrupted } from "../../services/dispatchResume";
import { continueOrder, resumeCopy } from "../../utils/dispatchResume";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";
import { Body } from "../ui/Typography/Typography";

/**
 * Offers to continue the Dispatch conversations an app close interrupted. Shown once per app start, after the
 * startup reads, when the CLI is installed and nothing is in progress; otherwise the conversations stay
 * interrupted for the next start. Continue starts the server if needed, then runs them in order. Not now stops
 * them, so the offer does not come back.
 */
export default function DispatchResumeGuard() {
  const { offer, dismiss } = useDispatchResumeOffer();
  if (!offer) return null;

  const copy = resumeCopy(offer.groups);
  const tasks = continueOrder(offer.groups);

  return (
    <ConfirmDialog
      title="Dispatch was interrupted"
      message={
        <>
          <Body>{copy.intro}</Body>
          {copy.items.length > 0 && (
            <ul>
              {copy.items.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
              {copy.more > 0 && <li>{`and ${copy.more} more`}</li>}
            </ul>
          )}
          <Body>{copy.modelLine}</Body>
        </>
      }
      confirmLabel="Continue"
      cancelLabel="Not now"
      onConfirm={() => {
        dismiss();
        void continueInterrupted(tasks);
      }}
      onCancel={() => {
        dismiss();
        void stopInterrupted(tasks);
      }}
    />
  );
}
