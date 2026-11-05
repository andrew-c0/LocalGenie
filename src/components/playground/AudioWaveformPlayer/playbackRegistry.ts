/**
 * The player that is playing now, as the function that pauses it. Starting one player pauses the others, so two
 * clips never play at once. A module-level slot, not a store: it only ever holds one pause function.
 */
let playing: (() => void) | null = null;

/** Records that `pause` is the player now playing, and pauses the one that was playing before. */
export function claimPlayback(pause: () => void): void {
  if (playing !== null && playing !== pause) playing();
  playing = pause;
}

/** Forgets `pause` when its player stops or goes away, so the slot does not keep a dead player. */
export function releasePlayback(pause: () => void): void {
  if (playing === pause) playing = null;
}
