import { CompanyPlan, CompanyStatus } from './enums';

export interface Company {
  id: string;
  name: string;
  plan: CompanyPlan;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}
