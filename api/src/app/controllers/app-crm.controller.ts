import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/data-source';
import { Lead } from '../../entities/lead.entity';
import { NotFoundError } from '../../utils/errors';
import { getTenantId } from '../../utils/request';
import { LeadActivity } from '../../entities/lead-activity.entity';
import { DocumentItem } from '../../entities/document.entity';
import { resolveStoredFileUrl } from '../../services/storage/storage.service';

export const listLeadsReadonly = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const leads = await repo.find({
      where: { tenantId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    res.deliver(200, true, leads, 'Leads fetched');
  } catch (error) {
    next(error);
  }
};

export const getLeadReadonly = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantId(req);
    const repo = AppDataSource.getRepository(Lead);
    const activityRepo = AppDataSource.getRepository(LeadActivity);
    const documentRepo = AppDataSource.getRepository(DocumentItem);
    const lead = await repo.findOne({
      where: { id: req.params.id, tenantId, isDeleted: false },
    });
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    const [activities, attachments] = await Promise.all([
      activityRepo.find({
        where: { tenantId, leadId: lead.id, isDeleted: false },
        order: { createdAt: 'DESC' },
      }),
      documentRepo.find({
        where: {
          tenantId,
          relatedEntityType: 'lead',
          relatedEntityId: lead.id,
          isDeleted: false,
        },
        order: { createdAt: 'DESC' },
      }),
    ]);
    res.deliver(
      200,
      true,
      {
        ...lead,
        activities,
        attachments: attachments.map((attachment) => ({
          ...attachment,
          fileUrl: resolveStoredFileUrl(attachment.fileUrl),
        })),
      },
      'Lead fetched',
    );
  } catch (error) {
    next(error);
  }
};
