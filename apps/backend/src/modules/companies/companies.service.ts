import { Injectable, NotFoundException } from '@nestjs/common';
import { Company } from '../../database/entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async getById(companyId: string): Promise<Company> {
    const manager = this.tenantContext.getManager();
    const company = await manager.findOne(Company, { where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }
}
