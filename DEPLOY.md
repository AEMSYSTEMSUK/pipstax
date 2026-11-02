# Pipstax deploy flow - PROPOSAL (2 Nov 2026, not in use yet)

Nothing here has been run on db1. It is a proposal for Andy to approve; until then Pipstax is still deployed by hand.

## What is live today (checked read-only, 2 Nov 2026)

| Thing | Where on db1 (`/var/www/vhosts/aemfruitydatabases.co.uk/`) | In git? |
|---|---|---|
| API (Express + TypeORM) | `api.aemproject.co.uk` - Passenger (Plesk Node.js), startup `app.js` -> `dist/server.js`, Node 26 | yes, `api/` |
| Tenant web app (Next 16) | `aemproject.co.uk` - Passenger, `app.js` -> `next start` equivalent | yes, `frontend/` |
| Platform admin app (`/sa/...`) | `admin.aemproject.co.uk` (Next, ~109 source files) | **no** |
| Worker app | `worker.aemproject.co.uk` (static build: `index.html` + `assets/`) | **no** (source unknown) |
| Database | local PostgreSQL on db1 (clusters 16-main and 17-main both running - which one Pipstax uses is in `api.aemproject.co.uk/.env`, `DB_PORT`) | n/a |

- **No drift:** every file under `api/src`, `api/sql`, `api/scripts`, `api/package.json`, `frontend/src`, `frontend/package.json`
  and `frontend/next.config.ts` on db1 has the same MD5 as `main` (c8af148). So `main` == live source today.
- `dist/` (API) and `.next/` (web) are built on the server. `.env` files exist only on the server (secrets - never in git).
- Restart = `touch <app>/tmp/restart.txt` (Passenger), or Plesk > Node.js > Restart.
- Files are owned by the subscription user `aemfruitydatabases.c_qesvveg8xea:psacln`; anything we copy in must keep that owner.
- There are stray macOS `._*` files in the API folder (harmless; excluded below).
- The original `.github/workflows/deploy-production.yml` files target the old EC2 box and are not run (sub-folder workflows never run).

## Proposed flow (same shape as ONE)

Edit + commit + push from Andy's Windows machine; db1 **pulls** with a read-only deploy key and builds in a staging
folder; the live folder is only touched after the build succeeds, with a backup taken first.

### One-time setup (needs Andy's yes - it changes db1)

1. GitHub `AEMSYSTEMSUK/pipstax` > Settings > Deploy keys: add a **read-only** key generated on db1 for the subscription
   user (`ssh-keygen -t ed25519 -f ~/.ssh/pipstax_deploy` as that user).
2. Clone to `/var/www/vhosts/aemfruitydatabases.co.uk/pipstax-src` (outside every web root), as the subscription user.
3. Create `/var/www/vhosts/aemfruitydatabases.co.uk/deployment-backups/pipstax/` for backups.
4. Write `deployment-backups/pipstax/<app>.deployed` = the commit now live (c8af148 for both) plus an MD5 manifest of the
   live source, so the first deploy has a baseline for the drift check.

### Each deploy - `ops/deploy-pipstax.sh <api|web> <commit>` (to be added to the repo once approved)

Run from the bastion: `ssh -n -i /root/.ssh/aem_fleet root@db1.infra.aemsystems.co.uk "sudo -u aemfruitydatabases.c_qesvveg8xea bash /var/www/vhosts/aemfruitydatabases.co.uk/pipstax-src/ops/deploy-pipstax.sh api <commit>"`

1. `flock` a lock file so two deploys can't overlap.
2. **Drift check:** MD5 the live source and compare with the manifest from the last deploy. If anything was edited by hand
   on db1, stop and print the changed files (someone must commit them first). This is what keeps git and db1 in step.
3. `git fetch` in `pipstax-src`, check out the requested commit (must be on `main`), copy the app folder to
   `staging/<app>-<sha>`.
4. Build in staging: `npm ci` then `npm run build`. The web build needs the live `NEXT_PUBLIC_*` values: copy the live
   `.env*` into staging for the build only and delete them after. Build fails -> stop; live is untouched.
5. **Database (API only):** if the release notes list schema scripts (`db:*`, e.g. `db:ai-workspace`), first
   `pg_dump -Fc` the Pipstax database to `deployment-backups/pipstax/db-<timestamp>.dump` (db1's backup mount goes to
   Hetzner sub9), then run each script with `node dist/scripts/<name>.js` from staging. Scripts are idempotent
   `CREATE ... IF NOT EXISTS`; `DB_SYNC` stays `false` - never let TypeORM synchronise a production schema.
6. **Backup live:** `tar` the live app folder (excluding `node_modules`, `public/uploads`, `.next/cache`) to
   `deployment-backups/pipstax/<app>-<timestamp>.tgz`. Keep the last 10.
7. **Swap:** `rsync -a --delete` staging -> live, excluding `.env*`, `public/uploads`, `tmp/`, `._*`, `.well-known`,
   `.php-*`, `.htaccess*`. Then `touch tmp/restart.txt`.
8. **Health check:** API `curl -fsS https://api.aemproject.co.uk/api/v1/health` -> `{"status":"ok"}`; web
   `curl -fsS -o /dev/null -w '%{http_code}' https://aemproject.co.uk/` -> 200 (use `--resolve` with db1's IP - the
   bastion resolver caches). On failure: restore the tarball, restart, re-check, exit non-zero.
9. Record the new commit + manifest in `<app>.deployed`; delete the staging folder.

Rollback: `ops/deploy-pipstax.sh <app> <previous-commit>` (fast path: untar the last backup + restart). Schema scripts
only ever add tables/columns, so the previous code keeps working against the newer schema.

### Before the flow is used for real

- Bring `admin.aemproject.co.uk` into the repo as `admin/` (same import approach as 5 Oct: copy source, exclude
  `.env*`/`node_modules`/build output, check for secrets) - it is the only place a platform admin can switch tenant
  modules, and AI Workspace's platform settings need a screen there.
- Find the worker app's source (it is a static build; the README says it comes from the frontend's `(worker)` area, but
  the deployed files look like a separate Vite build).
- Confirm which Postgres cluster/port Pipstax uses and that `pg_dump` works as the subscription user.
- Try the whole flow once against a copy (e.g. a `pipstax-staging` subdomain on db1 with a copy of the DB) before
  pointing it at the live folders.

## AI Workspace rollout (branch `overnight/ai-workspace-1102`)

1. Review + merge the branch to `main`.
2. Deploy `api` with the schema step `db:ai-workspace` (creates `ai_platform_settings`, `ai_tenant_settings`,
   `ai_spaces`, `ai_actions`, `ai_runs`, `ai_proposals`; adds dependency `@anthropic-ai/sdk`).
3. Deploy `web`.
4. In AEM's own Pipstax tenant: sidebar **AI Workspace** > **Manage** > paste an Anthropic key (checked, then stored
   encrypted in the DB - never in `.env`) > **Switch on**. Spaces/Actions seed themselves on first open.
5. Later, for client tenants on AEM's account: set the platform key + allow managed AI per tenant via
   `PUT /api/v1/platform/ai/settings` and `PUT /api/v1/platform/tenants/:id/ai` (needs the admin-app screen above);
   monthly per-tenant usage for billing: `GET /api/v1/platform/ai/usage?month=YYYY-MM`.
