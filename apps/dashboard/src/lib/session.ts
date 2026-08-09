import { apiFetch } from './api';
import { SafeUser } from './types';

/** Redirects to /login (via apiFetch's 401 handling) if the session is invalid. */
export async function getSession(): Promise<SafeUser> {
  return apiFetch<SafeUser>('/auth/me');
}
