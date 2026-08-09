import { IsISO8601, IsOptional } from 'class-validator';

/** Both optional — AnalyticsService defaults to the trailing 30 days when absent. */
export class AnalyticsRangeDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
