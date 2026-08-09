export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_BY_STATUS: Record<string, Tone> = {
  AVAILABLE: 'good',
  ONLINE: 'good',
  DELIVERED: 'good',
  DELIVERING: 'warn',
  PICKUP: 'warn',
  PICKED_UP: 'warn',
  ASSIGNED: 'warn',
  ACCEPTED: 'warn',
  PAUSED: 'warn',
  OFFLINE: 'bad',
  CANCELLED: 'bad',
  FAILED: 'bad',
  CREATED: 'neutral',
};

const ICON_BY_TONE: Record<Tone, string> = { good: '●', warn: '◐', bad: '⚠', neutral: '○' };

const CLASS_BY_TONE: Record<Tone, string> = {
  good: 'text-good bg-green-50',
  warn: 'text-warn bg-amber-50',
  bad: 'text-bad bg-red-50',
  neutral: 'text-ink-500 bg-ink-100',
};

/**
 * Status is never communicated by color alone anywhere in this app — every
 * pill pairs its color with a distinct icon shape AND a text label, so it
 * still reads correctly for color-blind users or in a quick black-and-white
 * screenshot. See the original design principles doc, §13 Accessibility.
 */
export function StatusPill({ status, label, tone: toneOverride }: { status: string; label: string; tone?: Tone }) {
  const tone = toneOverride ?? TONE_BY_STATUS[status] ?? 'neutral';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${CLASS_BY_TONE[tone]}`}
    >
      <span aria-hidden="true">{ICON_BY_TONE[tone]}</span>
      {label}
    </span>
  );
}
