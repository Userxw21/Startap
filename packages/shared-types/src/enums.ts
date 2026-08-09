/**
 * String-literal unions, not TypeScript `enum`s — deliberately. The backend
 * has its own real `enum`s (database/entities/enums.ts) tied to Postgres
 * enum columns; these are a separate, parallel definition used only at the
 * API-contract boundary. A backend string enum member (e.g. OrderStatus.CREATED,
 * whose runtime value is the string "CREATED") is structurally assignable to
 * the matching union type here with no cast needed, so backend controllers
 * can return these types directly without creating two competing runtime
 * symbols named "OrderStatus" that would fight each other on import.
 */

export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'DISPATCHER' | 'COURIER';

export type SupportedLocale = 'uz' | 'ru' | 'en';

export type CompanyPlan = 'TRIAL' | 'STANDARD' | 'ENTERPRISE';
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';

export type VehicleType = 'BICYCLE' | 'SCOOTER' | 'MOTORCYCLE';

export type CourierStatus = 'OFFLINE' | 'ONLINE' | 'AVAILABLE' | 'DELIVERING' | 'PAUSED';

export type DeviceStatus = 'UNPAIRED' | 'PAIRED' | 'CONNECTED' | 'DISCONNECTED' | 'REVOKED';
export type DeviceTransport = 'USB' | 'BLUETOOTH' | 'MOCK';

export type OrderStatus =
  | 'CREATED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'PICKUP'
  | 'PICKED_UP'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export type OrderPriority = 'NORMAL' | 'HIGH' | 'URGENT';
