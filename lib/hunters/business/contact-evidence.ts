const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function normalizedHostname(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function selectFirstPartyContactEmail(sourceUrl: string, contactEmails: string[]) {
  let websiteDomain: string;
  try {
    websiteDomain = normalizedHostname(new URL(sourceUrl).hostname);
  } catch {
    return null;
  }
  if (!websiteDomain) return null;

  for (const raw of contactEmails) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) continue;
    const emailDomain = normalizedHostname(email.split('@')[1] ?? '');
    if (emailDomain && emailDomain === websiteDomain) return email;
  }
  return null;
}
