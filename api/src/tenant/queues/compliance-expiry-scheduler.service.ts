import { In, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { ComplianceRecord } from '../../entities/compliance-record.entity';
import { notifyAdmins } from '../../services/in-app-notifications.service';
import { syncRenewalOpportunityForComplianceRecord } from '../../services/renewals.service';

const DEFAULT_INTERVAL_MS = 60_000;
let complianceExpiryTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

export const runComplianceExpiryTick = async () => {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const repo = AppDataSource.getRepository(ComplianceRecord);
    const now = new Date();
    const expirableRecords = await repo.find({
      where: {
        isDeleted: false,
        validUntil: LessThanOrEqual(now),
        reviewStatus: In(['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED']),
      },
      order: { validUntil: 'ASC' },
    });
    if (expirableRecords.length === 0) return;

    for (const record of expirableRecords) {
      try {
        record.reviewStatus = 'EXPIRED';
        await repo.save(record);
        await syncRenewalOpportunityForComplianceRecord(record);
        await notifyAdmins({
          tenantId: record.tenantId,
          title: 'Compliance Report Expired',
          message: `"${record.title}" expired on ${record.validUntil?.toLocaleDateString('en-GB') ?? 'its valid-until date'}.`,
          targetUrl: '/admin/compliance',
        }).catch((error) => {
          console.error('Compliance expiry notification failed:', error);
        });
      } catch (error) {
        console.warn('[compliance-expiry] failed for record', {
          recordId: record.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } finally {
    isTickRunning = false;
  }
};

export const startComplianceExpiryScheduler = () => {
  if (complianceExpiryTimer) return;
  const everyMs = Number(process.env.COMPLIANCE_EXPIRY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  void runComplianceExpiryTick();
  complianceExpiryTimer = setInterval(() => {
    void runComplianceExpiryTick();
  }, everyMs);
};
