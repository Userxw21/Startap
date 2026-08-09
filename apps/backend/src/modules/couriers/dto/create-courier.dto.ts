import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { SupportedLocale, VehicleType } from '../../../database/entities';

export class CreateCourierDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  password: string;

  @IsOptional()
  @IsEnum(SupportedLocale)
  preferredLanguage?: SupportedLocale;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;
}
