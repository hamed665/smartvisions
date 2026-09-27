import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('embeddable Web Chat widget security contract', () => {
  it('keeps session tokens out of polling URLs and uses exact public API headers', () => {
    const widget = readFileSync('app/api/web-chat/widget/route.ts', 'utf8');
    const messages = readFileSync('app/api/web-chat/messages/route.ts', 'utf8');
    const runtime = readFileSync('lib/web-chat/runtime.ts', 'utf8');

    expect(widget).toContain("'X-WebChat-Session-Token':state.sessionToken");
    expect(widget).not.toContain("searchParams.set('sessionToken'");
    expect(messages).toContain("request.headers.get('x-web-chat-session-token')");
    expect(runtime).toContain('X-WebChat-Session-Id,X-WebChat-Session-Token');
    expect(runtime).toContain(".eq('channel', 'WEB_CHAT')");
    expect(runtime).toContain(".eq('conversation_id', session.data.conversation_id)");
  });

  it('ships as a zero-dependency external script using a Shadow DOM boundary', () => {
    const widget = readFileSync('app/api/web-chat/widget/route.ts', 'utf8');
    expect(widget).toContain("attachShadow({mode:'open'})");
    expect(widget).toContain("credentials:'omit'");
    expect(widget).toContain("'Content-Type':'application/javascript; charset=utf-8'");
  });

  it('uploads bounded media through Smart Core without exposing Chatwoot authority', () => {
    const widget = readFileSync('app/api/web-chat/widget/route.ts', 'utf8');
    const upload = readFileSync('app/api/web-chat/upload/route.ts', 'utf8');
    expect(widget).toContain("new FormData()");
    expect(widget).toContain("/api/web-chat/upload?key=");
    expect(widget).toContain("files.length>4");
    expect(upload).toContain('const MAX_FILE_BYTES=10*1024*1024');
    expect(upload).toContain('const MAX_FILES=4');
    expect(upload).toContain("origin:origin??''");
    expect(widget).not.toContain('CHATWOOT_BASE_URL');
    expect(widget).not.toContain('access_token');
    expect(upload).not.toContain('CHATWOOT_BASE_URL');
  });
});
