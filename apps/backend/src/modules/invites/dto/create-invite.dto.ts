import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserRole, VehicleType } from '../../../database/entities';

const INVITABLE_ROLES = [UserRole.DISPATCHER, UserRole.COURIER] as const;

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsIn(INVITABLE_ROLES)
  role: (typeof INVITABLE_ROLES)[number];

  @ValidateIf((dto: CreateInviteDto) => dto.role === UserRole.COURIER)
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;
}
