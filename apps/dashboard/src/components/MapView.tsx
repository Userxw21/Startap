'use client';

import { useMemo, useState } from 'react';
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useRealtimeEvent } from './RealtimeProvider';
import type { Courier, CourierLastLocation, CourierLocationUpdatedPayload } from '@/lib/types';

/** Tashkent — sensible default center when no courier has a known position yet. */
const DEFAULT_CENTER = { lat: 41.2995, lng: 69.2401 };

type LiveLocations = Record<string, CourierLastLocation>;

function initialLocations(couriers: Courier[]): LiveLocations {
  const result: LiveLocations = {};
  for (const courier of couriers) {
    if (courier.lastLocation) result[courier.id] = courier.lastLocation;
  }
  return result;
}

interface MapViewProps {
  couriers: Courier[];
  noApiKeyMessage: string;
  emptyMessage: string;
}

/**
 * Deliberately does NOT use <RealtimeRefresher /> (the router.refresh()
 * pattern every other page uses) — that would re-fetch and re-render the
 * whole courier list on every location ping, which resets marker positions
 * instead of animating them and would fight with the map's own pan/zoom
 * state. Location updates are applied in place via local state instead;
 * new couriers (or ones who stop existing) only show up on next navigation
 * to this page, which is an acceptable v1 scope limit for a first live map.
 */
export function MapView({ couriers, noApiKeyMessage, emptyMessage }: MapViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? '',
    id: 'courier-platform-google-maps',
  });

  const [locations, setLocations] = useState<LiveLocations>(() => initialLocations(couriers));
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);

  useRealtimeEvent<CourierLocationUpdatedPayload>('courier:location:update', (payload) => {
    setLocations((prev) => ({
      ...prev,
      [payload.courierId]: {
        lat: payload.lat,
        lng: payload.lng,
        speedMps: payload.speedMps,
        headingDegrees: payload.headingDegrees,
        recordedAt: payload.recordedAt,
      },
    }));
  });

  const center = useMemo(() => {
    const first = Object.values(locations)[0];
    return first ? { lat: first.lat, lng: first.lng } : DEFAULT_CENTER;
  }, [locations]);

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-50 px-6 text-center text-sm text-ink-500">
        {noApiKeyMessage}
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-500">…</div>;
  }

  const visibleCouriers = couriers.filter((c) => locations[c.id]);

  return (
    <div className="relative h-full w-full">
      <GoogleMap mapContainerClassName="h-full w-full" center={center} zoom={visibleCouriers.length ? 13 : 11}>
        {visibleCouriers.map((courier) => {
          const loc = locations[courier.id];
          return (
            <MarkerF
              key={courier.id}
              position={{ lat: loc.lat, lng: loc.lng }}
              title={courier.user.fullName}
              onClick={() => setSelectedCourierId(courier.id)}
            >
              {selectedCourierId === courier.id && (
                <InfoWindowF onCloseClick={() => setSelectedCourierId(null)}>
                  <div className="text-sm">
                    <div className="font-medium">{courier.user.fullName}</div>
                    <div className="text-ink-500">{courier.status}</div>
                  </div>
                </InfoWindowF>
              )}
            </MarkerF>
          );
        })}
      </GoogleMap>
      {visibleCouriers.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div className="rounded-md bg-white px-4 py-2 text-sm text-ink-500 shadow-sm">{emptyMessage}</div>
        </div>
      )}
    </div>
  );
}
