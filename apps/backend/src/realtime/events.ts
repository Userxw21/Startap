/**
 * One name per event, used as BOTH the internal EventEmitter2 event name
 * (services emit these, decoupled from knowing a WebSocket gateway exists
 * at all) AND the Socket.IO event name broadcast to clients — see
 * RealtimeGateway's @OnEvent listeners, which are the only place these two
 * meanings meet. Reusing one string for both is deliberate: it keeps "what
 * event is this" a single fact instead of two names to keep in sync.
 */
export enum RealtimeEvent {
  CourierLocationUpdated = 'courier:location:update',
  CourierStatusChanged = 'courier:status:changed',
  OrderStatusChanged = 'order:status:changed',
  DeviceStatusChanged = 'device:status:changed',
}

export interface CourierLocationUpdatedPayload {
  companyId: string;
  courierId: string;
  lat: number;
  lng: number;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

export interface CourierStatusChangedPayload {
  companyId: string;
  courierId: string;
  status: string;
}

export interface OrderStatusChangedPayload {
  companyId: string;
  orderId: string;
  status: string;
  assignedCourierId: string | null;
}

export interface DeviceStatusChangedPayload {
  companyId: string;
  deviceId: string;
  status: string;
}
