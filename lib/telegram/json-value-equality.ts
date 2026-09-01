function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

export function jsonValueEqual(a: unknown, b: unknown) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}
