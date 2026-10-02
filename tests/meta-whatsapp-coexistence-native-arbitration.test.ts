import { describe, expect, it } from 'vitest';

import { extractWhatsAppNativeEchoes } from '@/lib/whatsapp/webhook';

describe('WhatsApp Business App native coexistence webhook', () => {
  it('normalizes a live smb_message_echoes event without treating the business number as the customer', () => {
    const events = extractWhatsAppNativeEchoes({
      entry: [{
        id: 'waba-1',
        changes: [{
          field: 'smb_message_echoes',
          value: {
            metadata: {
              display_phone_number: '+968 2400 0000',
              phone_number_id: 'phone-1',
            },
            contacts: [{
              wa_id: '96891234567',
              user_id: 'customer-user-1',
              parent_user_id: 'customer-parent-1',
            }],
            message_echoes: [{
              id: 'wamid.native-1',
              from: '96824000000',
              to: '96891234567',
              to_user_id: 'customer-user-1',
              to_parent_user_id: 'customer-parent-1',
              timestamp: '1790899200',
              type: 'text',
              text: { body: 'Human reply from the Business app' },
            }],
          },
        }],
      }],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      providerMessageId: 'wamid.native-1',
      from: '96824000000',
      to: '96891234567',
      recipientWaId: '96891234567',
      recipientUserId: 'customer-user-1',
      recipientParentUserId: 'customer-parent-1',
      type: 'text',
      text: 'Human reply from the Business app',
      destination: {
        displayPhoneNumber: '+968 2400 0000',
        phoneNumberId: 'phone-1',
        wabaId: 'waba-1',
      },
    });
    expect(events[0]?.recipientWaId).not.toBe(events[0]?.from);
  });

  it('never promotes historical synchronization into a live native-human event', () => {
    const events = extractWhatsAppNativeEchoes({
      entry: [{
        id: 'waba-1',
        changes: [{
          field: 'history',
          value: {
            metadata: {
              display_phone_number: '+968 2400 0000',
              phone_number_id: 'phone-1',
            },
            message_echoes: [{
              id: 'wamid.history-1',
              from: '96824000000',
              to: '96891234567',
              timestamp: '1790899100',
              type: 'text',
              text: { body: 'Older synchronized message' },
            }],
          },
        }],
      }],
    });

    expect(events).toEqual([]);
  });

  it('keeps ordinary customer messages out of the native-human parser', () => {
    const events = extractWhatsAppNativeEchoes({
      entry: [{
        id: 'waba-1',
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: 'phone-1' },
            message_echoes: [{
              id: 'wamid.not-native',
              from: '96824000000',
              to: '96891234567',
              type: 'text',
              text: { body: 'not a native echo field' },
            }],
          },
        }],
      }],
    });

    expect(events).toEqual([]);
  });
});
