import express from "express";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import router from "./router";
import { deliverMiddleware } from "./middleware/deliver";
import { errorHandler } from "./middleware/error";
import { auditContextMiddleware } from "./services/audit-context.service";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        const base = env.tenantBaseDomain?.toLowerCase().trim();
        const allowedOrigins = [env.appUrl, env.appPortalUrl, env.adminUrl, env.workerAppUrl]
          .filter(Boolean)
          .map((value) => value.toLowerCase());
        if (allowedOrigins.includes(origin.toLowerCase())) {
          return callback(null, true);
        }
        if (base && (hostname === base || hostname.endsWith(`.${base}`))) {
          return callback(null, true);
        }
        if (hostname.endsWith(".localhost")) {
          return callback(null, true);
        }
        if (hostname === "localhost" || hostname === "127.0.0.1") {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      } catch {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", env.tenantHeader, env.tenantSubdomainHeader],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(deliverMiddleware);
app.use(auditContextMiddleware);

app.use(
  "/uploads",
  (_req, res, next) => {
    // Allow tenant/admin frontends on different origins (localhost/subdomains)
    // to render uploaded assets like logos in <img> tags.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(process.cwd(), "public", "uploads")),
);
app.use("/api/v1", router);

app.use(errorHandler);

export default app;
