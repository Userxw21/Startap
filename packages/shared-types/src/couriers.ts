import { CourierStatus, VehicleType } from './enums';
import { SafeUser } from './auth';

export interface Vehicle {
  id: string;
  type: VehicleType;
  model: string | null;
  plateNumber: string | null;
}

export interface Courier {
  id: string;
  companyId: string;
  status: CourierStatus;
  currentDeviceId: string | null;
  user: SafeUser;
  vehicle: Vehicle;
  createdAt: string;
  updatedAt: string;
}
