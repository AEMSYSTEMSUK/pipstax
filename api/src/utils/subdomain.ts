import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';

export const normalizeSubdomain = (value?: string) => value?.trim().toLowerCase() ?? '';

export const slugifySubdomain = (value?: string) => {
  const raw = normalizeSubdomain(value);
  let slug = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  if (!slug) return 'tenant';
  if (slug.length < 3) {
    slug = `tenant-${slug}`;
  }
  return slug;
};

export const isValidSubdomain = (value: string) => {
  if (!value) return false;
  if (value.length < 3 || value.length > 63) return false;
  if (!/^[a-z0-9-]+$/.test(value)) return false;
  if (value.startsWith('-') || value.endsWith('-')) return false;
  return true;
};

export const generateUniqueSubdomain = async (repo: Repository<Tenant>, base: string) => {
  let candidate = base;
  let counter = 1;
  while (await repo.findOne({ where: { subdomain: candidate } })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
};
