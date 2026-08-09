'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export async function assignOrderAction(orderId: string, formData: FormData): Promise<void> {
  const courierId = String(formData.get('courierId') ?? '');
  if (!courierId) {
    redirect(`/orders/${orderId}`);
  }

  try {
    await apiFetch(`/orders/${orderId}/assign`, { method: 'POST', body: { courierId } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Unexpected error';
    redirect(`/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  redirect(`/orders/${orderId}`);
}

export async function cancelOrderAction(orderId: string, _formData: FormData): Promise<void> {
  try {
    await apiFetch(`/orders/${orderId}/transition`, { method: 'POST', body: { toStatus: 'CANCELLED' } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Unexpected error';
    redirect(`/orders/${orderId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  redirect(`/orders/${orderId}`);
}
