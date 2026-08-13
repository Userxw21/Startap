/**
 * Re-exported from @courier/shared-types so the dashboard (and any future
 * client) can import the exact same event names/payload shapes the backend
 * emits, instead of a hand-maintained duplicate drifting out of sync. This
 * file's path is kept stable since five modules already import from it —
 * see events.ts's own history for why one name serves both the internal
 * EventEmitter2 event and the Socket.IO event broadcast to clients.
 */
export {
  RealtimeEvent,
  type CourierLocationUpdatedPayload,
  type CourierStatusChangedPayload,
  type OrderStatusChangedPayload,
  type DeviceStatusChangedPayload,
} from '@courier/shared-types';
