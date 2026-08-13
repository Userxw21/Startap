import { CourierStatus, VehicleType } from './enums';
import { SafeUser } from './auth';
import { GeoPoint } from './geo';

export interface Vehicle {
  id: string;
  type: VehicleType;
  model: string | null;
  plateNumber: string | null;
}

/** Last position from the Redis location cache (see LocationCacheService) — absent if the courier has never sent one, or it's expired (90s TTL). */
export interface CourierLastLocation extends GeoPoint {
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

export interface Courier {
  id: string;
  companyId: string;
  status: CourierStatus;
  currentDeviceId: string | null;
  user: SafeUser;
  vehicle: Vehicle;
  lastLocation: CourierLastLocation | null;
  createdAt: string;
  updatedAt: string;
}
