import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { OrderPriority } from '../../../database/entities';
import { GeoPointDto } from './geo-point.dto';

export class CreateOrderDto {
  @IsString()
  @MinLength(3)
  pickupAddress: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  pickup: GeoPointDto;

  @IsString()
  @MinLength(3)
  deliveryAddress: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  delivery: GeoPointDto;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsISO8601()
  pickupDeadlineAt?: string;

  @IsOptional()
  @IsISO8601()
  deliveryDeadlineAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
