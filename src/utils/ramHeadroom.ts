/** Preference key that stores the share of total RAM kept free when a model loads. */
export const RAM_HEADROOM_KEY = "ram_headroom_percent";

/** Used until the user saves a value. */
export const RAM_HEADROOM_DEFAULT = 10;

export const RAM_HEADROOM_RANGE = { min: 0, max: 50 } as const;

export const RAM_HEADROOM_MESSAGE = `Enter a whole number from ${RAM_HEADROOM_RANGE.min} to ${RAM_HEADROOM_RANGE.max}`;

/** True for a whole percentage in the allowed range. A null (an empty field) is not valid. */
export function isValidHeadroom(percent: number | null): percent is number {
  return (
    percent !== null &&
    Number.isInteger(percent) &&
    percent >= RAM_HEADROOM_RANGE.min &&
    percent <= RAM_HEADROOM_RANGE.max
  );
}
