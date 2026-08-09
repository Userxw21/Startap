import { IsLatitude, IsLongitude } from 'class-validator';

export class GeoPointDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
