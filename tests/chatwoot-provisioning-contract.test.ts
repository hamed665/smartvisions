import { describe, expect, it } from 'vitest';
import {
  CHATWOOT_ACCOUNT_MARKER_KEY,
  CHATWOOT_USER_MARKER_KEY,
  buildChatwootAccountCustomAttributes,
  buildChatwootUserCustomAttributes,
  buildChatwootUserPresentation,
  findProjectedAccount,
  parseChatwootAccountUser,
  parseChatwootUser,
  userProjectionMarker,
} from '@/lib/chatwoot/provisioning-contract';

describe('Chatwoot core provisioning contract', () => {
  it('uses opaque Smart projection markers', () => {
    const tenantBusinessId = '20000000-0000-4000-8000-000000000001';
    const smartUserId = '30000000-0000-4000-8000-000000000001';

    expect(buildChatwootAccountCustomAttributes(tenantBusinessId)).toMatchObject({
      [CHATWOOT_ACCOUNT_MARKER_KEY]: tenantBusinessId,
      smartvisions_projection: true,
      smartvisions_projection_version: '1',
    });

    expect(buildChatwootUserCustomAttributes(smartUserId)).toMatchObject({
      [CHATWOOT_USER_MARKER_KEY]: smartUserId,
      smartvisions_projection: true,
      smartvisions_projection_version: '1',
    });
  });

  it('finds zero, one or ambiguous Account marker matches deterministically', () => {
    const tenantBusinessId = '20000000-0000-4000-8000-000000000001';
    const marker = buildChatwootAccountCustomAttributes(tenantBusinessId);

    expect(findProjectedAccount([], tenantBusinessId)).toEqual({ kind: 'NONE' });

    const one = findProjectedAccount(
      [{ id: 7, name: 'A', custom_attributes: marker }],
      tenantBusinessId,
    );
    expect(one.kind).toBe('ONE');

    const ambiguous = findProjectedAccount(
      [
        { id: 7, name: 'A', custom_attributes: marker },
        { id: 8, name: 'B', custom_attributes: marker },
      ],
      tenantBusinessId,
    );
    expect(ambiguous.kind).toBe('AMBIGUOUS');
  });

  it('sanitizes User responses and never returns upstream access_token', () => {
    const user = parseChatwootUser({
      id: 12,
      email: 'OWNER@EXAMPLE.COM',
      name: 'Owner',
      access_token: 'must-not-escape',
      custom_attributes: {
        smartvisions_user_id: '30000000-0000-4000-8000-000000000001',
      },
    });

    expect(user.email).toBe('owner@example.com');
    expect(user).not.toHaveProperty('access_token');
    expect(userProjectionMarker(user)).toBe(
      '30000000-0000-4000-8000-000000000001',
    );
  });

  it('preserves AccountUser bigint ID as a decimal string', () => {
    expect(
      parseChatwootAccountUser({
        id: '9223372036854775807',
        account_id: 12,
        user_id: 13,
        role: 'agent',
      }),
    ).toEqual({
      id: '9223372036854775807',
      accountId: 12,
      userId: 13,
      role: 'agent',
    });
  });

  it('uses canonical email as honest name fallback', () => {
    expect(
      buildChatwootUserPresentation({
        email: ' Owner@Example.Com ',
        trustedDisplayName: null,
      }),
    ).toEqual({
      email: 'owner@example.com',
      name: 'owner@example.com',
      displayName: null,
    });
  });
});
