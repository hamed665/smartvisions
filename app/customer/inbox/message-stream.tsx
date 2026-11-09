'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function StudioMessageStream({ latestId, children }: { latestId?: string; children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const element = list.current;
    if (element && latestId) element.scrollTop = element.scrollHeight;
  }, [latestId]);
  return <ol className="studio-messages" ref={list} aria-label="Messages" tabIndex={0}>{children}</ol>;
}
