import { env } from '../config/env';

export const shouldExposeAuthDetails = () =>
  env.nodeEnv !== 'production' && Boolean(env.exposeAuthDetails);

export const withAuthDetails = <T extends Record<string, any>>(
  payload: T,
  details: Record<string, any>
) => {
  if (!shouldExposeAuthDetails()) {
    return payload;
  }
  const sanitized = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  return { ...payload, authDetails: sanitized };
};
