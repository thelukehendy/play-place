/** Pause so players can see the winning move before results. */
export const CELEBRATE_MS = 2400;

export function afterCelebrate(fn: () => void, ms = CELEBRATE_MS): number {
  return window.setTimeout(fn, ms);
}
