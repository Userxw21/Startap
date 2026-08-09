'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useRealtimeEvent } from './RealtimeProvider';

/**
 * Renders nothing — just re-fetches the current page's Server Component
 * data (router.refresh()) whenever a relevant realtime event arrives,
 * debounced so a burst of events doesn't hammer the server with refetches.
 *
 * Deliberately calls router.refresh() rather than maintaining separate
 * client-side state that merges incoming events into what the Server
 * Component already fetched: simpler, and correct by construction, since
 * there's only ever one representation of the data (whatever the backend
 * currently says) instead of two that could drift apart. The tradeoff is a
 * full re-fetch per burst of events rather than a precise in-place update —
 * fine at MVP data volume (see original architecture's infra-cost
 * section), worth revisiting only if that stops being true.
 *
 * Subscribes to all four event types unconditionally (not a dynamic prop)
 * to keep every hook call fixed and unconditional, per React's rules of
 * hooks — every page that renders this gets refreshed on any of the four,
 * which is the right behavior for all of Overview/Couriers/Orders anyway.
 */
export function RealtimeRefresher() {
  const router = useRouter();
  const pending = useRef(false);

  function scheduleRefresh() {
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => {
      pending.current = false;
      router.refresh();
    }, 800);
  }

  useRealtimeEvent('courier:location:update', scheduleRefresh);
  useRealtimeEvent('courier:status:changed', scheduleRefresh);
  useRealtimeEvent('order:status:changed', scheduleRefresh);
  useRealtimeEvent('device:status:changed', scheduleRefresh);

  return null;
}
