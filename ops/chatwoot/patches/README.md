# Chatwoot Smart Visions patch stack

Place ordered Community-source patches here only when configuration/API integration is insufficient.

Naming convention:

`0001-short-purpose.patch`
`0002-next-purpose.patch`

Rules:

- patches must apply to the exact source locked in `../source.lock.json`;
- no patch may modify a path under `enterprise/`;
- every patch must have a narrow Smart Visions reason;
- prefer upstream/configuration/API behavior over source modification;
- do not add provider-send authority to Chatwoot for Smart Visions-controlled channels;
- do not copy Smart Core business truth into Chatwoot source;
- rebase/refresh patches explicitly when the upstream source pin changes;
- failed patch application fails the build.

No production patch is currently required for the source foundation.
