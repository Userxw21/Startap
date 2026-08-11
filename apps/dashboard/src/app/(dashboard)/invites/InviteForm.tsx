'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { createInviteAction, CreateInviteState } from './actions';

const initialState: CreateInviteState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('invites');
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600 disabled:opacity-60"
    >
      {pending ? t('sending') : t('send')}
    </button>
  );
}

export function InviteForm() {
  const t = useTranslations('invites');
  const [state, formAction] = useFormState(createInviteAction, initialState);
  const [role, setRole] = useState<'COURIER' | 'DISPATCHER'>('COURIER');
  const [copied, setCopied] = useState(false);

  const acceptUrl =
    state.created && typeof window !== 'undefined' ? `${window.location.origin}/accept-invite?token=${state.created.token}` : null;

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-medium text-ink-700">{t('sendNew')}</h2>

      {state.created && acceptUrl && (
        <div className="mt-4 rounded-sm bg-green-50 p-4">
          <p className="text-sm text-good">{t('linkCreated')}</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={acceptUrl} className="flex-1 rounded-sm border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(acceptUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-sm border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className="mt-4 rounded-sm bg-red-50 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-ink-700" htmlFor="email">
            {t('email')}
          </label>
          <input id="email" name="email" type="email" required className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700" htmlFor="fullName">
            {t('fullName')}
          </label>
          <input id="fullName" name="fullName" type="text" required className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700" htmlFor="role">
            {t('role')}
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'COURIER' | 'DISPATCHER')}
            className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-sm"
          >
            <option value="COURIER">{t('roleCourier')}</option>
            <option value="DISPATCHER">{t('roleDispatcher')}</option>
          </select>
        </div>

        {role === 'COURIER' && (
          <>
            <div>
              <label className="block text-sm font-medium text-ink-700" htmlFor="vehicleType">
                {t('vehicleType')}
              </label>
              <select id="vehicleType" name="vehicleType" required className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-sm">
                <option value="BICYCLE">BICYCLE</option>
                <option value="SCOOTER">SCOOTER</option>
                <option value="MOTORCYCLE">MOTORCYCLE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700" htmlFor="plateNumber">
                {t('plateNumber')}
              </label>
              <input id="plateNumber" name="plateNumber" type="text" className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
