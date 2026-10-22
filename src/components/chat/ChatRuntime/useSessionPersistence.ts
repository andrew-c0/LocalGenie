import { useEffect } from "react";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";

/** Delay before sessions that changed are written to the DB. */
const SESSION_SAVE_DELAY_MS = 500;

/**
 * Writes every session whose content changed to the DB, debounced. Flushes on unmount so pending
 * edits are not lost.
 */
export function useSessionPersistence() {
  useEffect(() => {
    const dirty = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      for (const session of useChatStore.getState().sessions) {
        if (dirty.has(session.id)) db.saveSession(session).catch(() => undefined);
      }
      dirty.clear();
    };

    const unsubscribe = useChatStore.subscribe((state, prev) => {
      if (state.sessions === prev.sessions) return;
      const previous = new Map(prev.sessions.map((s) => [s.id, s]));
      for (const session of state.sessions) {
        if (previous.get(session.id) !== session) dirty.add(session.id);
      }
      clearTimeout(timer);
      timer = setTimeout(flush, SESSION_SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
      flush();
    };
  }, []);
}
