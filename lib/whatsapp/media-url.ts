export function trustedMetaMediaUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (
      host !== 'lookaside.fbsbx.com'
      && !host.endsWith('.fbcdn.net')
      && !host.endsWith('.facebook.com')
    ) return null;
    return url;
  } catch {
    return null;
  }
}
