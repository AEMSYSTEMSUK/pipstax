import { In, IsNull, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { QuoteStatus } from '../../constants/status';
import { LeadActivity } from '../../entities/lead-activity.entity';
import { Quote } from '../../entities/quote.entity';

const DEFAULT_INTERVAL_MS = 60_000;
let quoteExpiryTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

const runQuoteExpiryTick = async () => {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const quoteRepo = AppDataSource.getRepository(Quote);
    const activityRepo = AppDataSource.getRepository(LeadActivity);
    const now = new Date();
    const expirableQuotes = await quoteRepo.find({
      where: {
        isDeleted: false,
        expiredAt: IsNull(),
        validUntil: LessThanOrEqual(now),
        status: In([QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.VIEWED]),
      },
      order: { validUntil: 'ASC' },
    });
    if (expirableQuotes.length === 0) return;

    for (const quote of expirableQuotes) {
      try {
        quote.status = QuoteStatus.DECLINED;
        quote.declinedAt = quote.declinedAt ?? now;
        quote.expiredAt = now;
        await quoteRepo.save(quote);

        if (quote.leadId) {
          await activityRepo.save(
            activityRepo.create({
              tenantId: quote.tenantId,
              leadId: quote.leadId,
              type: 'Quote Expired',
              message: `Quote "${quote.title}" expired after valid-until date.`,
              metadata: {
                quoteId: quote.id,
                validUntil: quote.validUntil?.toISOString() ?? null,
              },
            }),
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[quote-expiry] failed for quote', {
          quoteId: quote.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } finally {
    isTickRunning = false;
  }
};

export const startQuoteExpiryScheduler = () => {
  if (quoteExpiryTimer) return;
  const everyMs = Number(process.env.QUOTE_EXPIRY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  void runQuoteExpiryTick();
  quoteExpiryTimer = setInterval(() => {
    void runQuoteExpiryTick();
  }, everyMs);
};
