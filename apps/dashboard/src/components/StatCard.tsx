export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}
