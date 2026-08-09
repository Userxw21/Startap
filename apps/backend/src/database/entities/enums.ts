export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  DISPATCHER = 'DISPATCHER',
  COURIER = 'COURIER',
}

export enum CourierStatus {
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  AVAILABLE = 'AVAILABLE',
  DELIVERING = 'DELIVERING',
  PAUSED = 'PAUSED',
}

export enum VehicleType {
  BICYCLE = 'BICYCLE',
  SCOOTER = 'SCOOTER',
  MOTORCYCLE = 'MOTORCYCLE',
}

export enum OrderStatus {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  PICKUP = 'PICKUP',
  PICKED_UP = 'PICKED_UP',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum OrderPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum DeviceStatus {
  UNPAIRED = 'UNPAIRED',
  PAIRED = 'PAIRED',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  REVOKED = 'REVOKED',
}

export enum DeviceTransport {
  USB = 'USB',
  BLUETOOTH = 'BLUETOOTH',
  MOCK = 'MOCK',
}

export enum SupportedLocale {
  UZ = 'uz',
  RU = 'ru',
  EN = 'en',
}
