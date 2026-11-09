'use client';

import { useEffect, useRef, useState } from 'react';
import { STUDIO_REPLY_AUDIO_LIMIT, STUDIO_REPLY_RECORDING_FORMATS, STUDIO_REPLY_RECORDING_SECONDS, studioReplyAudioMime } from '@/lib/voice/studio-reply-audio';
import { STUDIO_VOICE_MAX_SECONDS, studioWave } from '@/lib/voice/studio-wave';

const SAMPLE_RATE = 16_000;

async function toWave(blob: Blob) {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const length = Math.min(decoded.length, SAMPLE_RATE * STUDIO_VOICE_MAX_SECONDS);
  const mix = new Float32Array(length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < length; i++) mix[i] += channel[i] / decoded.numberOfChannels;
  }
  return studioWave(mix);
}

export function StudioRecording({ businessId, threadId, onTranscript, onSendAudio, disabled }: {
  businessId: string;
  threadId?: string;
  onTranscript: (text: string) => void;
  onSendAudio?: (audio: Blob) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [clip, setClip] = useState<{ blob: Blob; url: string }>();
  const [notice, setNotice] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      request.current?.abort();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  async function start() {
    if (phase !== 'idle' || disabled) return;
    setPhase('starting');
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Unsupported browser');
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        input.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = input;
      const mimeType = onSendAudio ? STUDIO_REPLY_RECORDING_FORMATS.find(type => MediaRecorder.isTypeSupported(type)) : undefined;
      const media = new MediaRecorder(input, { audioBitsPerSecond: 32000, ...(mimeType ? { mimeType } : {}) });
      const chunks: Blob[] = [];
      recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onerror = () => {
        if (mounted.current) setNotice('Recording was interrupted. Try the microphone again.');
      };
      media.onstop = () => {
        clearTimeout(timer.current);
        input.getTracks().forEach(track => track.stop());
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: media.mimeType });
        if (blob.size) setClip({ blob, url: URL.createObjectURL(blob) });
        else setNotice('No audio was captured. Check microphone permissions and try again.');
        setPhase('idle');
      };
      media.start();
      timer.current = setTimeout(() => { if (media.state === 'recording') media.stop(); }, (onSendAudio ? STUDIO_REPLY_RECORDING_SECONDS : STUDIO_VOICE_MAX_SECONDS) * 1000);
      setPhase('recording');
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      if (!mounted.current) return;
      setNotice('The microphone is unavailable. Check browser permissions or use text or PDF.');
      setPhase('idle');
    }
  }

  async function transcribe() {
    if (!clip || phase !== 'idle' || disabled) return;
    setPhase('transcribing');
    setNotice('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const audio = await toWave(clip.blob);
      const params = new URLSearchParams({ businessId });
      if (threadId) params.set('thread', threadId);
      const response = await fetch('/api/customer/studio-voice?'+params, {
        method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.text !== 'string') throw new Error(data.error || 'Transcription is unavailable.');
      if (mounted.current) onTranscript(data.text);
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : 'Transcription is unavailable.');
    } finally {
      if (mounted.current) setPhase('idle');
    }
  }

  const sendMime = studioReplyAudioMime(clip?.blob.type);
  const canSend = Boolean(clip && sendMime && clip.blob.size <= STUDIO_REPLY_AUDIO_LIMIT);
  return <div className="studio-recording">
    <p>{onSendAudio ? 'Preview your recording, send the original audio, or convert it to editable text.'
      : 'Describe your services and rules. Choose Transcribe to send this recording to the transcription provider for text conversion.'}</p>
    <div className="studio-filters">
      <button type="button" disabled={disabled || phase !== 'idle'} onClick={start}>{phase === 'starting' ? 'Requesting microphone…' : clip ? 'Record again' : 'Start recording'}</button>
      {phase === 'recording' && <button type="button" onClick={() => {
        if (recorder.current?.state === 'recording') recorder.current.stop();
      }}>Stop recording</button>}
    </div>
    {phase === 'recording' && <p role="status">Recording in progress</p>}
    {clip && phase !== 'recording' && <audio aria-label="Play recording" controls src={clip.url} />}
    {clip && <button className="studio-button" type="button" disabled={disabled || phase !== 'idle'} onClick={transcribe}>
      {phase === 'transcribing' ? 'Transcribing…' : 'Transcribe recording'}
    </button>}
    {onSendAudio && phase === 'idle' && <label>Use an existing audio file
      <input type="file" accept=".m4a,.mp3,.ogg,.opus,audio/mp4,audio/mpeg,audio/ogg" disabled={disabled} onChange={event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        const byExtension = /\.(ogg|opus)$/i.test(file.name) ? 'audio/ogg' : /\.m4a$/i.test(file.name) ? 'audio/mp4'
          : /\.mp3$/i.test(file.name) ? 'audio/mpeg' : null;
        const type = studioReplyAudioMime(file.type) ?? byExtension;
        if (!type || !file.size || file.size > STUDIO_REPLY_AUDIO_LIMIT) {
          setNotice('Choose a non-empty MP3, M4A, or Opus OGG file up to 6 MB.');
          return;
        }
        setNotice('');
        setClip({ blob: file.slice(0, file.size, type), url: URL.createObjectURL(file) });
      }} />
    </label>}
    {onSendAudio && clip && <>
      <button type="button" className="studio-button" disabled={disabled || phase !== 'idle' || !canSend}
        onClick={async () => {
          if (canSend && sendMime && await onSendAudio(clip.blob.slice(0, clip.blob.size, sendMime)) && mounted.current) setClip(undefined);
        }}>Send original audio</button>
      {!canSend && <p>This recording format cannot be sent directly. Convert it to text or choose an MP3, M4A, or Opus OGG file.</p>}
    </>}
    {notice && <p role="alert">{notice}</p>}
  </div>;
}
