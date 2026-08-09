'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { loginAction, LoginState } from './actions';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth');
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

export default function LoginPage() {
  const t = useTranslations('auth');
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm rounded-lg border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('subtitle')}</p>

        {state.error && (
          <p role="alert" className="mt-4 rounded-sm bg-red-50 px-3 py-2 text-sm text-bad">
            {t('invalidCredentials')}
          </p>
        )}

        <label className="mt-6 block text-sm font-medium text-ink-700" htmlFor="email">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-base outline-none focus:border-accent-500"
        />

        <label className="mt-4 block text-sm font-medium text-ink-700" htmlFor="password">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-base outline-none focus:border-accent-500"
        />

        <div className="mt-6">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
