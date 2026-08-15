export type Locale = 'uz' | 'ru' | 'en';
export const SUPPORTED_LOCALES: Locale[] = ['uz', 'ru', 'en'];
export const DEFAULT_LOCALE: Locale = 'uz';

/**
 * Deliberately a plain nested-object dictionary rather than i18next — this
 * app has two screens so far. Mirrors the shape of the dashboard's
 * messages/*.json (same key style) so porting to a real i18n library later,
 * if the string count grows enough to justify one, is a straight copy.
 */
export const translations = {
  uz: {
    auth: {
      title: 'Kuryer platformasi',
      subtitle: 'Hisobingizga kiring',
      email: 'Email',
      password: 'Parol',
      submit: 'Kirish',
      submitting: 'Kirilmoqda...',
      invalidCredentials: 'Email yoki parol noto‘g‘ri',
    },
    home: {
      title: 'Bosh sahifa',
      loggedInAs: 'Kirgan foydalanuvchi',
      status: 'Holat',
      logout: 'Chiqish',
    },
    status: {
      OFFLINE: 'Oflayn',
      ONLINE: 'Onlayn',
      AVAILABLE: "Bo'sh",
      DELIVERING: 'Yetkazmoqda',
      PAUSED: 'Pauza',
    },
  },
  ru: {
    auth: {
      title: 'Курьерская платформа',
      subtitle: 'Войдите в аккаунт',
      email: 'Email',
      password: 'Пароль',
      submit: 'Войти',
      submitting: 'Вход...',
      invalidCredentials: 'Неверный email или пароль',
    },
    home: {
      title: 'Главная',
      loggedInAs: 'Вы вошли как',
      status: 'Статус',
      logout: 'Выйти',
    },
    status: {
      OFFLINE: 'Офлайн',
      ONLINE: 'Онлайн',
      AVAILABLE: 'Свободен',
      DELIVERING: 'Доставляет',
      PAUSED: 'Пауза',
    },
  },
  en: {
    auth: {
      title: 'Courier Platform',
      subtitle: 'Sign in to your account',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      submitting: 'Signing in...',
      invalidCredentials: 'Invalid email or password',
    },
    home: {
      title: 'Home',
      loggedInAs: 'Logged in as',
      status: 'Status',
      logout: 'Log out',
    },
    status: {
      OFFLINE: 'Offline',
      ONLINE: 'Online',
      AVAILABLE: 'Available',
      DELIVERING: 'Delivering',
      PAUSED: 'Paused',
    },
  },
} as const;
