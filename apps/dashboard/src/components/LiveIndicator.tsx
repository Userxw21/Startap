'use client';

import { useTranslations } from 'next-intl';
import { useRealtimeConnectionStatus } from './RealtimeProvider';
import { StatusPill, Tone } from './StatusPill';

const TONE_BY_CONNECTION_STATUS: Record<string, Tone> = {
  connected: 'good',
  connecting: 'neutral',
  disconnected: 'bad',
};

export function LiveIndicator() {
  const status = useRealtimeConnectionStatus();
  const t = useTranslations('common');
  return <StatusPill status={status} label={t(status)} tone={TONE_BY_CONNECTION_STATUS[status]} />;
}
