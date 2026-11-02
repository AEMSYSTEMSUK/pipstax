import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { getTenantId, getUserId } from '../../utils/request';
import {
  Actor, loadActor, getStatus, getSettings, updateSettings, listSpaces, updateSpace, createAction, updateAction, deleteAction,
  startRun, listRuns, getRun, pendingProposals, decideProposal, usageThisMonth,
} from '../../services/ai-workspace/ai-workspace.service';

// AI Workspace (#229 part 3). Every handler loads the signed-in person (permissions + roles) for THIS tenant; the
// service scopes Spaces, tools and history to that. Writes to Pipstax data only happen via /proposals/:id/approve.
const router = Router();
router.use(authMiddleware, tenantMiddleware);

const handle = (fn: (a: Actor, req: Request) => Promise<unknown>, message: string, code = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = await loadActor(getTenantId(req), getUserId(req));
      res.deliver(code, true, await fn(actor, req), message);
    } catch (error) {
      next(error);
    }
  };

router.get('/status', handle((a) => getStatus(a), 'AI Workspace status'));
router.get('/settings', handle((a) => getSettings(a), 'AI settings'));
router.put('/settings', handle((a, req) => updateSettings(a, req.body || {}), 'AI settings saved'));
router.get('/usage', handle((a) => usageThisMonth(a), 'AI usage'));
router.get('/spaces', handle((a) => listSpaces(a), 'Spaces'));
router.put('/spaces/:id', handle((a, req) => updateSpace(a, String(req.params.id), req.body || {}), 'Space saved'));
router.post('/actions', handle((a, req) => createAction(a, req.body || {}), 'Action created', 201));
router.put('/actions/:id', handle((a, req) => updateAction(a, String(req.params.id), req.body || {}), 'Action saved'));
router.delete('/actions/:id', handle((a, req) => deleteAction(a, String(req.params.id)), 'Action deleted'));
router.post('/run', handle((a, req) => startRun(a, req.body || {}), 'Started', 202));
router.get('/runs', handle((a, req) => listRuns(a, req.query || {}), 'Runs'));
router.get('/runs/:id', handle((a, req) => getRun(a, String(req.params.id)), 'Run'));
router.get('/proposals', handle((a) => pendingProposals(a), 'Pending proposals'));
router.post('/proposals/:id/approve', handle((a, req) => decideProposal(a, String(req.params.id), true), 'Approved'));
router.post('/proposals/:id/reject', handle((a, req) => decideProposal(a, String(req.params.id), false), 'Rejected'));

export default router;
