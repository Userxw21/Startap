import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getRequestLocale } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Courier Platform',
  description: 'Fleet management dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getRequestLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
