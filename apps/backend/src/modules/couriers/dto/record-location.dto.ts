import { IsLatitude, IsLongitude, IsNumber, IsOptional } from 'class-validator';

export class RecordLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  speedMps?: number;

  @IsOptional()
  @IsNumber()
  headingDegrees?: number;
}
