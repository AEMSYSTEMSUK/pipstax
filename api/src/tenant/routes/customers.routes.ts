import { Router } from 'express';
import {
  listCustomers,
  getCustomer,
  getCustomerDetails,
  listCustomerContacts,
  createCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  listCustomerSiteGroups,
  createCustomerSiteGroup,
  updateCustomerSiteGroup,
  deleteCustomerSiteGroup,
  listCustomerSites,
  listCustomerSiteContacts,
  createCustomerSite,
  updateCustomerSite,
  deleteCustomerSite,
  createCustomerSiteContact,
  updateCustomerSiteContact,
  deleteCustomerSiteContact,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  resetCustomerPassword
} from '../controllers/customers/customers.controller';
import {
  listCustomerSiteComplianceRecords,
  createCustomerSiteComplianceRecord,
  updateCustomerSiteComplianceRecord,
  deleteCustomerSiteComplianceRecord,
} from '../controllers/customers/compliance-records.controller';
import { inviteCustomer } from '../controllers/customers/customer-invites.controller';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { CustomerAdminResetPasswordDto, CustomerInviteDto } from '../dto/customer-invite.dto';
import { requireTenantFeature } from '../../middleware/tenant-feature';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.CRM_VIEW), listCustomers);
router.get('/:id/details', requirePermission(Permissions.CRM_VIEW), getCustomerDetails);
router.get('/:id/contacts', requirePermission(Permissions.CRM_VIEW), listCustomerContacts);
router.post('/:id/contacts', requirePermission(Permissions.CRM_MANAGE), createCustomerContact);
router.put('/:id/contacts/:contactId', requirePermission(Permissions.CRM_MANAGE), updateCustomerContact);
router.delete('/:id/contacts/:contactId', requirePermission(Permissions.CRM_MANAGE), deleteCustomerContact);
router.get('/:id/site-groups', requirePermission(Permissions.CRM_VIEW), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), listCustomerSiteGroups);
router.post('/:id/site-groups', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), createCustomerSiteGroup);
router.put('/:id/site-groups/:siteGroupId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), updateCustomerSiteGroup);
router.delete('/:id/site-groups/:siteGroupId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), deleteCustomerSiteGroup);
router.get('/:id/sites', requirePermission(Permissions.CRM_VIEW), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), listCustomerSites);
router.post('/:id/sites', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), createCustomerSite);
router.put('/:id/sites/:siteId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), updateCustomerSite);
router.delete('/:id/sites/:siteId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), deleteCustomerSite);
router.get('/:id/sites/:siteId/contacts', requirePermission(Permissions.CRM_VIEW), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), listCustomerSiteContacts);
router.post('/:id/sites/:siteId/contacts', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), createCustomerSiteContact);
router.put('/:id/sites/:siteId/contacts/:contactId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), updateCustomerSiteContact);
router.delete('/:id/sites/:siteId/contacts/:contactId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('sites', 'Sites module is not enabled for this workspace.'), deleteCustomerSiteContact);
router.get('/:id/sites/:siteId/compliance-records', requirePermission(Permissions.CRM_VIEW), requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'), listCustomerSiteComplianceRecords);
router.post('/:id/sites/:siteId/compliance-records', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'), createCustomerSiteComplianceRecord);
router.put('/:id/sites/:siteId/compliance-records/:recordId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'), updateCustomerSiteComplianceRecord);
router.delete('/:id/sites/:siteId/compliance-records/:recordId', requirePermission(Permissions.CRM_MANAGE), requireTenantFeature('complianceReports', 'Compliance reports module is not enabled for this workspace.'), deleteCustomerSiteComplianceRecord);
router.get('/:id', requirePermission(Permissions.CRM_VIEW), getCustomer);
router.post('/', requirePermission(Permissions.CRM_MANAGE), createCustomer);
router.post('/:id/reset-password', requirePermission(Permissions.CRM_MANAGE), validateBody(CustomerAdminResetPasswordDto), resetCustomerPassword);
router.put('/:id', requirePermission(Permissions.CRM_MANAGE), updateCustomer);
router.delete('/:id', requirePermission(Permissions.CRM_MANAGE), deleteCustomer);
router.post('/invite', requirePermission(Permissions.CRM_MANAGE), validateBody(CustomerInviteDto), inviteCustomer);

export default router;
