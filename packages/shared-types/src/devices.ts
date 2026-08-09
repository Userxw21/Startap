import { DeviceStatus } from './enums';

/** pairingTokenHash never included — see backend's @Exclude() on Device.pairingTokenHash. */
export interface Device {
  id: string;
  companyId: string;
  hardwareId: string;
  pairedCourierId: string | null;
  protocolVersion: number;
  firmwareVersion: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  batteryPct: number | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /devices/:id/pair's response shape — the one place the plaintext pairing token appears, exactly once. */
export interface DevicePairingResult {
  device: Device;
  pairingToken: string;
}
