export function normalize(str) {
  return (str || '').toLowerCase().trim();
}

export function filterLibrary(library, query) {
  const q = normalize(query);
  if (!q) return library;
  return library.filter((t) => normalize(t.title).includes(q));
}

