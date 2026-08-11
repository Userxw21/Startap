import { UserRole, VehicleType } from './enums';

/** Shape of a row from GET /invites — role is always DISPATCHER or COURIER in practice. */
export interface Invite {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: UserRole;
  vehicleType: VehicleType | null;
  vehicleModel: string | null;
  plateNumber: string | null;
  expiresAt: string;
  invitedByUserId: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /invites' response — not the raw entity, includes the one-time plaintext token. */
export interface CreateInviteResponse {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  token: string;
}

/** GET /invites/preview/:token's response. */
export interface InvitePreview {
  email: string;
  fullName: string;
  role: UserRole;
  companyName: string;
  valid: boolean;
}
