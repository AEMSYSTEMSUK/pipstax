import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/permissions';
import { Permissions } from '../../constants/permissions';
import { validateBody } from '../../middleware/validate';
import {
  createTeam,
  deleteTeam,
  listAssignableWorkers,
  listTeams,
  replaceTeamMembers,
  updateTeam,
} from '../controllers/admin/teams.controller';
import {
  TeamCreateDto,
  TeamMembersUpdateDto,
  TeamUpdateDto,
} from '../dto/team.dto';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', requirePermission(Permissions.TEAM_VIEW), listTeams);
router.get('/assignable-workers', requirePermission(Permissions.TEAM_VIEW), listAssignableWorkers);
router.post('/', requirePermission(Permissions.TEAM_MANAGE), validateBody(TeamCreateDto), createTeam);
router.put('/:id', requirePermission(Permissions.TEAM_MANAGE), validateBody(TeamUpdateDto), updateTeam);
router.put(
  '/:id/members',
  requirePermission(Permissions.TEAM_MANAGE),
  validateBody(TeamMembersUpdateDto),
  replaceTeamMembers,
);
router.delete('/:id', requirePermission(Permissions.TEAM_MANAGE), deleteTeam);

export default router;
