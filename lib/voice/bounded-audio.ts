export async function readBoundedAudio(request: Request | Response, maxBytes: number) {
  const length = Number(request.headers.get('content-length'));
  if (length > maxBytes) return null;
  const stream = request.body?.getReader();
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await stream.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    stream.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
