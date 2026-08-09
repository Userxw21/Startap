import { IsUUID } from 'class-validator';

export class PairDeviceDto {
  @IsUUID()
  courierId: string;
}
