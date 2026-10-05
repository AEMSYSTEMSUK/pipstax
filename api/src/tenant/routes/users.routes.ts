import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import { ChangePasswordDto, UserCreateDto, UserResetPasswordDto, UserUpdateDto, UserUpdateRolesDto } from '../dto/user.dto';
import { listUsers, createUser, updateUserDetails, updateUserRoles, getMe, changeMyPassword, getUserDetails, resetUserPassword } from '../controllers/admin/users.controller';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.TEAM_VIEW), listUsers);
router.get('/me', getMe);
router.get('/:id/details', requirePermission(Permissions.TEAM_VIEW), getUserDetails);
router.post('/change-password', validateBody(ChangePasswordDto), changeMyPassword);
router.post('/', requirePermission(Permissions.TEAM_MANAGE), validateBody(UserCreateDto), createUser);
router.post('/:id/reset-password', requirePermission(Permissions.TEAM_MANAGE), validateBody(UserResetPasswordDto), resetUserPassword);
router.put('/:id', requirePermission(Permissions.TEAM_MANAGE), validateBody(UserUpdateDto), updateUserDetails);
router.put('/:id/roles', requirePermission(Permissions.TEAM_MANAGE), validateBody(UserUpdateRolesDto), updateUserRoles);

export default router;
