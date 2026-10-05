# Pipstax

AEM's modular business platform (kernel + modules; see `Pipstax-Module-Spec-and-Adjustments.md` in AEM's documents).

| Folder | What | Live (Oct 2026) |
|---|---|---|
| `frontend/` | Next.js 16 / React 19 / shadcn — client admin, customer portal, worker app, auth | aemproject.co.uk (db1 Plesk, subscription aemfruitydatabases.co.uk) |
| `api/` | Express 4 + TypeORM + PostgreSQL — tenants, CRM, quotes, jobs, invoicing, contractors, compliance | api.aemproject.co.uk |

The worker app (worker.aemproject.co.uk) is a build of the frontend's `(worker)` area.

Imported into git on 5 Oct 2026 from the files running on db1 (previously not version-controlled). Secrets (`.env*`) and runtime uploads are deliberately excluded. The `.github/workflows` inside each folder are the original EC2 deploy pipelines, kept for reference — GitHub does not run workflows from sub-folders.
