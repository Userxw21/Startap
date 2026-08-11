import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { StatusPill } from '@/components/StatusPill';
import { InviteForm } from './InviteForm';
import { revokeInviteAction } from './actions';
import type { Invite } from '@/lib/types';

type InviteState = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

function inviteState(invite: Invite): InviteState {
  if (invite.revokedAt) return 'REVOKED';
  if (invite.acceptedAt) return 'ACCEPTED';
  if (new Date(invite.expiresAt) < new Date()) return 'EXPIRED';
  return 'PENDING';
}

const TONE_BY_STATE: Record<InviteState, 'good' | 'warn' | 'bad' | 'neutral'> = {
  ACCEPTED: 'good',
  PENDING: 'warn',
  REVOKED: 'bad',
  EXPIRED: 'bad',
};

export default async function InvitesPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);
  const invites = await apiFetch<Invite[]>('/invites');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">{t('invites.title')}</h1>

      <div className="mt-6">
        <InviteForm />
      </div>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-ink-500">{t('invites.pendingTitle')}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-200 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('invites.colEmail')}</th>
              <th className="px-4 py-3 font-medium">{t('invites.colRole')}</th>
              <th className="px-4 py-3 font-medium">{t('invites.colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('invites.colExpires')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const state = inviteState(invite);
              return (
                <tr key={invite.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50">
                  <td className="px-4 py-3 text-ink-900">{invite.email}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {invite.role === 'COURIER' ? t('invites.roleCourier') : t('invites.roleDispatcher')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={state} label={t(`invites.status${capitalize(state)}`)} tone={TONE_BY_STATE[state]} />
                  </td>
                  <td className="px-4 py-3 text-ink-700">{new Date(invite.expiresAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-3 text-right">
                    {state === 'PENDING' && (
                      <form action={revokeInviteAction.bind(null, invite.id)}>
                        <button type="submit" className="text-xs font-medium text-bad hover:underline">
                          {t('invites.revoke')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                  {t('invites.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
