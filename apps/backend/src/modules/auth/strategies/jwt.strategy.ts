import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

interface AccessTokenPayload {
  sub: string;
  companyId: string | null;
  role: AuthenticatedUser['role'];
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.accessSecret'),
    });
  }

  /** Return value becomes request.user — this is the ONLY place a raw JWT payload is trusted. */
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      email: payload.email,
    };
  }
}
