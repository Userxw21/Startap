'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { acceptInviteAction, AcceptInviteState } from './actions';

const initialState: AcceptInviteState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('acceptInvite');
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-accent-500 px-4 py-3 text-base font-medium text-white transition hover:bg-accent-600 disabled:opacity-60"
    >
      {pending ? t('submitting') : t('submit')}
    </button>
  );
}

export function AcceptInviteForm({
  token,
  companyName,
  role,
}: {
  token: string;
  companyName: string;
  role: string;
}) {
  const t = useTranslations('acceptInvite');
  const tRoles = useTranslations('invites');
  const action = acceptInviteAction.bind(null, token);
  const [state, formAction] = useFormState(action, initialState);

  const roleLabel = role === 'COURIER' ? tRoles('roleCourier') : tRoles('roleDispatcher');

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm rounded-lg border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('joining', { company: companyName, role: roleLabel })}</p>

        {state.error && (
          <p role="alert" className="mt-4 rounded-sm bg-red-50 px-3 py-2 text-sm text-bad">
            {t(`error${state.error.charAt(0).toUpperCase()}${state.error.slice(1)}`)}
          </p>
        )}

        {role === 'COURIER' && (
          <>
            <label className="mt-6 block text-sm font-medium text-ink-700" htmlFor="phone">
              {t('phone')}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="998901234567"
              pattern="998\d{9}"
              title={t('phoneHint')}
              autoComplete="tel"
              className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-base outline-none focus:border-accent-500"
            />
            <p className="mt-1 text-xs text-ink-500">{t('phoneHint')}</p>
          </>
        )}

        <label className="mt-6 block text-sm font-medium text-ink-700" htmlFor="password">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-base outline-none focus:border-accent-500"
        />

        <label className="mt-4 block text-sm font-medium text-ink-700" htmlFor="confirmPassword">
          {t('confirmPassword')}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-base outline-none focus:border-accent-500"
        />

        <div className="mt-6">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
