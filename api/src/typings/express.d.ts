import 'express';

declare module 'express-serve-static-core' {
  interface Response {
    deliver: (statusCode: number, success: boolean, data: unknown, message?: string) => void;
  }

  interface Request {
    tenantId?: string;
    tenantSubdomain?: string;
    userId?: string;
    roles?: string[];
    permissions?: Record<string, boolean>;
    platformAdminId?: string;
    platformRoles?: string[];
    platformPermissions?: Record<string, boolean>;
    customerAccountId?: string;
  }
}
