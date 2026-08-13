import { getRequestConfig } from 'next-intl/server';
import { getMessages, getRequestLocale } from '@/lib/i18n';

export default getRequestConfig(() => {
  const locale = getRequestLocale();
  return {
    locale,
    messages: getMessages(locale),
  };
});
