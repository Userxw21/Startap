import { IsString, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  /** The identifier burned into the device at manufacture — see original architecture §7. */
  @IsString()
  @MinLength(4)
  hardwareId: string;
}
