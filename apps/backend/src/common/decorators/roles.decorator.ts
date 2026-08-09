import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../database/entities';

export const ROLES_KEY = 'roles';

/** Route-level RBAC — pair with RolesGuard. e.g. @Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER) */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring authentication (e.g. login, register, health check). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
