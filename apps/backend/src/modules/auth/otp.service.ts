import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../realtime/redis.provider';

const CODE_TTL_SECONDS = 5 * 60; // 5 minutes to enter the code
const COOLDOWN_SECONDS = 60; // minimum gap between two SMS to the same number

/**
 * Redis-backed, not the DB — an OTP code is exactly the kind of
 * short-lived, expiring-by-design data Redis already handles elsewhere in
 * this app (see LocationCacheService). Codes are hashed before storage for
 * the same reason refresh tokens are (see RefreshToken entity's docstring):
 * a Redis dump or `MONITOR` session shouldn't hand out working codes.
 */
@Injectable()
export class OtpService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private codeKey(phoneUz: string): string {
    return `otp:code:${phoneUz}`;
  }

  private cooldownKey(phoneUz: string): string {
    return `otp:cooldown:${phoneUz}`;
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Returns null if this phone requested a code too recently — caller should skip sending. */
  async issue(phoneUz: string): Promise<string | null> {
    const onCooldown = await this.redis.exists(this.cooldownKey(phoneUz));
    if (onCooldown) return null;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(this.codeKey(phoneUz), this.hash(code), 'EX', CODE_TTL_SECONDS);
    await this.redis.set(this.cooldownKey(phoneUz), '1', 'EX', COOLDOWN_SECONDS);
    return code;
  }

  /**
   * Single-use, but only on an actual match — deleting the code on every
   * attempt (including wrong ones) was the original design here, found
   * wrong by actually testing it: a single mistyped digit would silently
   * invalidate the real code, forcing a whole new SMS for a simple typo.
   * Brute-forcing a 6-digit code is instead left to the controller's own
   * throttle on /auth/reset-password (5 attempts/15min per IP), which is
   * the right layer for rate-limiting guesses.
   */
  async verify(phoneUz: string, code: string): Promise<boolean> {
    const stored = await this.redis.get(this.codeKey(phoneUz));
    const matches = stored !== null && stored === this.hash(code);
    if (matches) {
      await this.redis.del(this.codeKey(phoneUz));
    }
    return matches;
  }
}
