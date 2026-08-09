import { IsIn, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../../../database/entities';

const TRANSITIONABLE_STATUSES = [
  OrderStatus.ACCEPTED,
  OrderStatus.PICKUP,
  OrderStatus.PICKED_UP,
  OrderStatus.DELIVERING,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
] as const;

export class TransitionOrderDto {
  @IsIn(TRANSITIONABLE_STATUSES)
  toStatus: (typeof TRANSITIONABLE_STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
