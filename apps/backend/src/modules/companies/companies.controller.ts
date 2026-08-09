import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  getMyCompany(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not attached to a company');
    }
    return this.companiesService.getById(user.companyId);
  }
}
