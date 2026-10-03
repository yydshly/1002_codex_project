import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(query).matches;
}

// Motion's useReducedMotion in our pinned version reads the initial preference.
// Subscribe explicitly so an already-open demo also follows subsequent changes.
export function useSystemReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
