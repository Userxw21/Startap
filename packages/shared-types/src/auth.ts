import { SupportedLocale, UserRole } from './enums';

/** What GET /auth/me and every other endpoint returns for a User — passwordHash never included (see backend's @Exclude() on User.passwordHash). */
export interface SafeUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: UserRole;
  companyId: string | null;
  preferredLanguage: SupportedLocale;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** POST /auth/login and POST /auth/refresh both return this shape (see AuthService). */
export interface LoginResponse extends TokenPair {
  user: SafeUser;
}
