import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { AcceptInviteForm } from './AcceptInviteForm';
import type { InvitePreview } from '@/lib/types';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Public — deliberately does NOT use lib/api.ts's apiFetch(), which reads
 * the access-token cookie and redirects to /login on 401. This page must
 * work for a visitor with no session at all (that's the point of an
 * invite), and the backend endpoints it calls are @Public() regardless —
 * a plain fetch avoids any accidental coupling to the authenticated-request
 * assumptions the rest of the dashboard's data fetching makes.
 */
async function fetchPreview(token: string): Promise<InvitePreview | null> {
  try {
    const res = await fetch(`${BACKEND_API_URL}/invites/preview/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AcceptInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  const locale = getRequestLocale();
  const t = getTranslator(locale);
  const token = searchParams.token;

  const preview = token ? await fetchPreview(token) : null;

  if (!preview || !preview.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-ink-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-ink-900">{t('acceptInvite.invalidTitle')}</h1>
          <p className="mt-2 text-sm text-ink-500">{t('acceptInvite.invalidMessage')}</p>
        </div>
      </div>
    );
  }

  // Using the `searchParams` prop already opts this route out of static
  // rendering (a documented Next.js dynamic API), so the preview above is
  // always fetched fresh — never a stale cached result for a token that's
  // since been accepted/revoked/expired.
  return <AcceptInviteForm token={token as string} companyName={preview.companyName} role={preview.role} />;
}
