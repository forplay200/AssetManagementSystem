# Node.js runtime

Updated: 2026-10-22 (Asia/Kuala_Lumpur).

The project uses **Node.js 24.22.1 LTS**, released on 2026-10-21 with security fixes.
See the [official security announcement](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
and [release details](https://nodejs.org/en/blog/release/v24.22.1).

## Version configuration

- `.nvmrc` pins the local/CI version to `24.22.1`.
- Both Docker build files use `node:24.22.1-alpine`.
- Package manifests require `>=24.22.1 <25`; their lockfile root metadata matches.
- GitHub CI reads `.nvmrc`. Checkout and setup-node use their Node.js 24 based v6 actions. The action runtime itself is supplied by the GitHub runner.
- Backend and frontend dependency versions remain locked. Backend Docker installation uses `npm ci`.
- The frontend production container serves static files with Nginx; Node.js runs during its build.
- Python AI services do not use this Node.js runtime.

## Local Windows installation

Install the [official Windows x64 MSI](https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi),
or the matching ARM64 installer on ARM machines. The system installation requires
Windows administrator approval. Open a new terminal after installation and check:

```powershell
node --version
npm.cmd --version
```

Expected Node.js version: `v24.22.1`.

## Existing Docker deployment

Changing the host installation does not update an existing container. From the repository root:

```powershell
docker compose build --pull backend frontend
docker compose up -d --no-deps backend frontend
docker compose exec -T backend node --version
```

Start PostgreSQL, MinIO and Redis first if they are stopped. The rebuild uses the
existing data volumes. `docker compose down -v` removes persistent volumes and
must not be used for this upgrade.

## Future security updates

Check the official Node.js security announcements. Update `.nvmrc`, both Docker
base tags, and the package engine minimum/root lockfile metadata together when
adopting a new security release. Rebuild and recreate the affected containers.

Node.js security fixes and npm dependency vulnerabilities have separate release
cycles. Updating Node.js does not resolve every dependency advisory; dependency
changes should be reviewed separately instead of applying `npm audit fix --force` blindly.

## Deployment record: 2026-10-22

- Windows Node.js: `v24.18.0` → `v24.22.1`; bundled npm: `11.19.1`. The official MSI's SHA256 and OpenJS Authenticode signature were checked before installation.
- Local production frontend build and both Docker builds completed. The running backend reports `v24.22.1`; frontend HTTP and backend/database/Redis/MinIO health checks passed.
- All seven Compose services are running. The existing four accounts, 16 assets and 40 storage objects were preserved; original database/storage digests matched after removal of the previous task's disposable fixtures.
- Unit tests were not rerun as part of this runtime upgrade. GitHub CI has been configured locally and still needs a pushed commit to run remotely.
- npm installation reported existing dependency advisories (backend: 19; frontend including build/development dependencies: 115). No automatic dependency upgrade was applied.

Docker Desktop initially failed on stale IPC endpoints. With Desktop stopped,
only the empty runtime endpoint directories were preserved under:

```text
C:\Users\User\AppData\Local\Docker\run.node-update-20261022-222b1f7d
C:\Users\User\AppData\Local\docker-secrets-engine.node-update-20261022-1e4161b3
```

Desktop recreated its runtime directories and started successfully. No VM disks,
data volumes or settings were reset.

Docker Hub's Nginx download repeatedly returned EOF. For this deployment, the
existing local frontend image supplied its unchanged Nginx runtime via Docker's
named build context. The frontend build stage still used official
`node:24.22.1-alpine` and ran `npm ci` and `npm run build` successfully:

```powershell
docker build --build-context nginx:alpine=docker-image://assetmanagementsystem-frontend:nginx-base-node-update-20261022 -f Dockerfile.frontend -t assetmanagementsystem-frontend:latest ./frontend
```
