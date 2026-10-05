import { Router, Request, Response, NextFunction } from "express";
import { uploadAny, uploadImageOnly } from "../../middleware/upload.middleware";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { getTenantId } from "../../utils/request";
import { resolveTenantStorageContext, storeTenantFile } from "../../services/storage/storage.service";

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post(
  "/multiple",
  uploadImageOnly.array("photos", 5),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.deliver(400, false, null, "No files uploaded");
      }
      const tenantId = getTenantId(req);
      const storageContext = await resolveTenantStorageContext(tenantId);
      const uploaded = await Promise.all(
        files.map((file) => storeTenantFile(storageContext, file, { scope: "attachments" })),
      );
      const paths = uploaded.map((item) => item.key);

      res.deliver(201, true, paths, "Files uploaded successfully");
    } catch (err: any) {
      next(err);
    }
  },
);

router.post(
  "/multiple-any",
  uploadAny.array("photos", 5),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.deliver(400, false, null, "No files uploaded");
      }
      const tenantId = getTenantId(req);
      const storageContext = await resolveTenantStorageContext(tenantId);
      const uploaded = await Promise.all(
        files.map((file) => storeTenantFile(storageContext, file, { scope: "attachments" })),
      );
      const paths = uploaded.map((item) => item.key);

      res.deliver(201, true, paths, "Files uploaded successfully");
    } catch (err: any) {
      next(err);
    }
  },
);

export default router;
