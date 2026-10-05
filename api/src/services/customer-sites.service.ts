import { AppDataSource } from '../config/data-source';
import { CustomerSite } from '../entities/customer-site.entity';
import { NotFoundError } from '../utils/errors';

type CustomerSiteAddressShape = Pick<
  CustomerSite,
  'addressLine1' | 'addressLine2' | 'city' | 'state' | 'postalCode' | 'country'
>;

export const buildCustomerSiteAddress = (site?: CustomerSiteAddressShape | null) => {
  if (!site) {
    return undefined;
  }

  const parts = [
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.state,
    site.postalCode,
    site.country,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
};

export const findCustomerSiteForTenant = async (tenantId: string, siteId: string) => {
  const repo = AppDataSource.getRepository(CustomerSite);
  return repo.findOne({
    where: { id: siteId, tenantId, isDeleted: false },
  });
};

export const ensureCustomerSiteForTenant = async (tenantId: string, siteId: string) => {
  const site = await findCustomerSiteForTenant(tenantId, siteId);
  if (!site) {
    throw new NotFoundError('Selected site not found');
  }
  return site;
};
