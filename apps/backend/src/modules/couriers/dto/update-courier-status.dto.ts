import { IsIn } from 'class-validator';
import { CourierStatus } from '../../../database/entities';

/** DELIVERING is deliberately excluded — that transition happens only as a
 * side effect of order assignment (a later phase), never a direct courier action. */
const SELF_SETTABLE_STATUSES = [
  CourierStatus.OFFLINE,
  CourierStatus.ONLINE,
  CourierStatus.AVAILABLE,
  CourierStatus.PAUSED,
] as const;

export class UpdateCourierStatusDto {
  @IsIn(SELF_SETTABLE_STATUSES)
  status: (typeof SELF_SETTABLE_STATUSES)[number];
}
