import { IsString, Matches } from 'class-validator';

export class ForgotPasswordDto {
  /** 998 + 9 digits, no "+" — matches AcceptInviteDto's format, and what the SMS provider expects. */
  @IsString()
  @Matches(/^998\d{9}$/, { message: 'Phone must be in the format 998XXXXXXXXX' })
  phone: string;
}
