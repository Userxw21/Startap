import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../database/entities';

/** Shape of the JWT payload attached to request.user by JwtStrategy. */
export interface AuthenticatedUser {
  userId: string;
  companyId: string | null;
  role: UserRole;
  email: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
