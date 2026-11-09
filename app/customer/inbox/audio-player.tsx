'use client';

import { useState } from 'react';

export function StudioAudioPlayer({ src }: { src: string }) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable
    ? <p role="status">This recording could not be played. Its transcript remains available when present.</p>
    : <audio className="studio-voice-player" controls preload="none" src={src} aria-label="Play WhatsApp audio" onError={() => setUnavailable(true)} />;
}
