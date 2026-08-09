import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';

const DEFAULT_RANGE_DAYS = 30;

@Roles(UserRole.COMPANY_ADMIN, UserRole.DISPATCHER)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query() range: AnalyticsRangeDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }

    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from ? new Date(range.from) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    return this.analyticsService.getSummary(user.companyId, from, to);
  }
}
