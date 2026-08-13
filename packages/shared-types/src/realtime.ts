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
