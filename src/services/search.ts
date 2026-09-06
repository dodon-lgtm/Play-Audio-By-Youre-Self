// ============================================================
// search.ts — Filter pencarian
// Port TypeScript dari js/search.js.
// ============================================================

import type { Track } from '../types/track';

export function normalize(str: string): string {
  return (str || '').toLowerCase().trim();
}

export function filterLibrary(library: Track[], query: string): Track[] {
  const q = normalize(query);
  if (!q) return library;
  return library.filter((t) => normalize(t.title).includes(q));
}