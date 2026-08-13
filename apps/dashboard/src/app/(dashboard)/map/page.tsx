import { apiFetch } from '@/lib/api';
import { getRequestLocale, getTranslator } from '@/lib/i18n';
import { MapView } from '@/components/MapView';
import type { Courier } from '@/lib/types';

export default async function MapPage() {
  const locale = getRequestLocale();
  const t = getTranslator(locale);
  const couriers = await apiFetch<Courier[]>('/couriers');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">{t('map.title')}</h1>
      <div className="mt-6 h-[70vh] overflow-hidden rounded-lg border border-ink-200 bg-white">
        <MapView
          couriers={couriers}
          noApiKeyMessage={t('map.noApiKey')}
          emptyMessage={t('map.empty')}
        />
      </div>
    </div>
  );
}
