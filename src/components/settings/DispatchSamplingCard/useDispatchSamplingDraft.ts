import { useEffect, useState } from "react";
import * as db from "../../../services/database";
import {
  DISPATCH_SAMPLING_DEFAULTS,
  type DispatchSampling,
  dispatchSamplingProblem,
  sameDispatchSampling,
} from "../../../utils/dispatchSampling";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** The saved Dispatch sampling profile as an editable draft. The controls edit the draft; saving stores it. */
export interface DispatchSamplingDraft {
  draft: DispatchSampling;
  /** Why the draft cannot be saved, or null when it can. */
  problem: string | null;
  canSave: boolean;
  isSaving: boolean;
  isAtDefaults: boolean;
  updateDraft: (patch: Partial<DispatchSampling>) => void;
  resetDraft: () => void;
  saveDraft: () => Promise<void>;
}

/** Loads the saved profile into a draft, and saves the draft back. A failed load keeps the defaults in the draft. */
export function useDispatchSamplingDraft(): DispatchSamplingDraft {
  const [saved, setSaved] = useState<DispatchSampling | null>(null);
  const [draft, setDraft] = useState<DispatchSampling>(DISPATCH_SAMPLING_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    db.loadDispatchSampling()
      .then((profile) => {
        setSaved(profile);
        setDraft(profile);
      })
      .catch((err: unknown) => console.error("Failed to load Dispatch sampling:", err));
  }, []);

  const problem = dispatchSamplingProblem(draft);
  const isDirty = saved !== null && !sameDispatchSampling(saved, draft);

  const updateDraft = (patch: Partial<DispatchSampling>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const resetDraft = () => {
    setDraft({ ...DISPATCH_SAMPLING_DEFAULTS });
  };

  const saveDraft = async () => {
    setIsSaving(true);
    try {
      await db.saveDispatchSampling(draft);
      setSaved(draft);
      toast.success("Dispatch sampling saved");
    } catch (err) {
      toast.error("Could not save Dispatch sampling", errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    draft,
    problem,
    canSave: isDirty && problem === null && !isSaving,
    isSaving,
    isAtDefaults: sameDispatchSampling(draft, DISPATCH_SAMPLING_DEFAULTS),
    updateDraft,
    resetDraft,
    saveDraft,
  };
}
