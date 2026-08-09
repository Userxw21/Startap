/** "3725" -> "1h 2m". Falls back to "—" for null (no data in range yet). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** "1834" -> "1.8 km". Falls back to "—" for null. */
export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}
