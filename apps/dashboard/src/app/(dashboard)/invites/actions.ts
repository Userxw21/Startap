'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';
import type { CreateInviteResponse } from '@/lib/types';

export interface CreateInviteState {
  error?: string;
  created?: { email: string; role: string; token: string };
}

export async function createInviteAction(_prevState: CreateInviteState, formData: FormData): Promise<CreateInviteState> {
  const email = String(formData.get('email') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  const vehicleType = String(formData.get('vehicleType') ?? '') || undefined;
  const plateNumber = String(formData.get('plateNumber') ?? '').trim() || undefined;

  if (!email || !fullName || !role) {
    return { error: 'missing' };
  }

  try {
    const invite = await apiFetch<CreateInviteResponse>('/invites', {
      method: 'POST',
      body: { email, fullName, role, vehicleType, plateNumber },
    });
    revalidatePath('/invites');
    return { created: { email: invite.email, role: invite.role, token: invite.token } };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Unexpected error' };
  }
}

export async function revokeInviteAction(inviteId: string): Promise<void> {
  await apiFetch(`/invites/${inviteId}/revoke`, { method: 'POST' });
  revalidatePath('/invites');
}
