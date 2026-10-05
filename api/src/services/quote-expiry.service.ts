import { Repository } from 'typeorm';
import { QuoteStatus } from '../constants/status';
import { Quote } from '../entities/quote.entity';

const FINAL_STATUSES = new Set<QuoteStatus>([QuoteStatus.SIGNED, QuoteStatus.DECLINED]);

export const isQuoteExpired = (quote: Quote, now: Date = new Date()) => {
  if (quote.expiredAt) return true;
  if (!quote.validUntil) return false;
  if (FINAL_STATUSES.has(quote.status)) return false;
  return quote.validUntil.getTime() <= now.getTime();
};

export const expireQuoteIfNeeded = async (
  quoteRepo: Repository<Quote>,
  quote: Quote,
  now: Date = new Date(),
) => {
  if (!isQuoteExpired(quote, now)) {
    return false;
  }
  if (quote.expiredAt) {
    return true;
  }
  quote.status = QuoteStatus.DECLINED;
  quote.declinedAt = quote.declinedAt ?? now;
  quote.expiredAt = now;
  await quoteRepo.save(quote);
  return true;
};
