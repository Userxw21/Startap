import { IsUUID } from 'class-validator';

export class AssignOrderDto {
  @IsUUID()
  courierId: string;
}
