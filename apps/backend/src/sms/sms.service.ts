import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SMS_SENDER = 'SMS_SENDER';

export interface SmsSender {
  send(phoneUz: string, message: string): Promise<void>;
}

/**
 * Used whenever ESKIZ_EMAIL/ESKIZ_PASSWORD aren't configured — logs instead
 * of sending, so forgot-password can be developed and tested (the code
 * shows up in the server log) without a real SMS account. Same pattern as
 * the dashboard's Google Maps key: absent config degrades to something
 * usable for dev, not a crash. See ESKIZ setup notes in .env.example.
 */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS (console fallback)');

  async send(phoneUz: string, message: string): Promise<void> {
    this.logger.warn(`ESKIZ_EMAIL/ESKIZ_PASSWORD not configured — would send to +${phoneUz}: "${message}"`);
  }
}

interface EskizAuthResponse {
  data: { token: string };
}

/**
 * Eskiz.uz — chosen after comparing SMS providers for Uzbekistan: ~95 UZS
 * per SMS, self-serve signup with local payment methods (Payme/Click/Uzum),
 * versus international providers that don't reliably or cheaply reach
 * Uzbek numbers. See README's "Forgot password (SMS)" section for the
 * account-setup step this still needs (email/password, not done by this
 * code — sign up at eskiz.uz yourself).
 *
 * Token is cached in memory and re-fetched on expiry/failure — acceptable
 * at single-instance scale (same tradeoff already made for
 * LocationsService's in-memory throttle map); a multi-instance deployment
 * would want this cached somewhere shared instead.
 */
@Injectable()
export class EskizSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS (Eskiz)');
  private readonly baseUrl = 'https://notify.eskiz.uz/api';
  private token: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(phoneUz: string, message: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile_phone: phoneUz,
        message,
        from: this.config.get<string>('sms.eskizNickname') ?? '4546',
      }),
    });

    if (res.status === 401) {
      // Token expired/invalid — re-authenticate once and retry, rather than
      // failing a legitimate password-reset request over a stale cache.
      this.token = null;
      const freshToken = await this.getToken();
      const retry = await fetch(`${this.baseUrl}/message/sms/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_phone: phoneUz, message, from: this.config.get<string>('sms.eskizNickname') ?? '4546' }),
      });
      if (!retry.ok) {
        throw new Error(`Eskiz SMS send failed after token refresh: ${retry.status}`);
      }
      return;
    }

    if (!res.ok) {
      throw new Error(`Eskiz SMS send failed: ${res.status}`);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: this.config.get<string>('sms.eskizEmail'),
        password: this.config.get<string>('sms.eskizPassword'),
      }),
    });
    if (!res.ok) {
      throw new Error(`Eskiz auth failed: ${res.status}`);
    }
    const data = (await res.json()) as EskizAuthResponse;
    this.token = data.data.token;
    return this.token;
  }
}
