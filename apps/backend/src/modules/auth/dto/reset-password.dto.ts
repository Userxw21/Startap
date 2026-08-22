import { IsString, Length, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^998\d{9}$/, { message: 'Phone must be in the format 998XXXXXXXXX' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  code: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  newPassword: string;
}
