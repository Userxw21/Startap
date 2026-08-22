import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  password: string;

  /**
   * Optional at the DTO level (dispatcher invites don't need it) —
   * InvitesService.accept() enforces "required for courier invites"
   * once it knows the invite's role. Uzbek mobile format, matching what
   * the SMS provider expects: 998 + 9 digits, no "+", no spaces.
   */
  @IsOptional()
  @IsString()
  @Matches(/^998\d{9}$/, { message: 'Phone must be in the format 998XXXXXXXXX' })
  phone?: string;
}
