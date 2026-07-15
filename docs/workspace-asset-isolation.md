# Workspace Asset Isolation

## Current Architecture

The platform uses authenticated accounts plus workspace memberships stored as `Team` and `TeamMember` records. The active workspace is selected by the frontend and validated by the authentication middleware. Assets now store canonical `workspaceId`; deprecated `teamId` remains temporarily for non-destructive migration compatibility. User-facing repository queries require exact `workspaceId` equality and never include null assets.

The target hierarchy is:

```text
Workspace
└── Project (optional, future)
    └── Assets
```

Assets will reference `workspaceId` directly. A future nullable `projectId` can be added beneath the workspace without changing workspace isolation.

## Problems With Global Assets

- A newly created workspace can see legacy unscoped assets.
- Search and dashboard counts can include assets outside the intended repository.
- Null ownership prevents reliable authorization for preview, download, metadata, versions, and comments.
- Team roles are validated, but the asset itself is not consistently bound to that workspace identity.

## Migration Strategy

This plan was defined before any destructive database change:

1. Add nullable, indexed `Assets.workspaceId` with a foreign key to `Teams.id`.
2. Backfill `workspaceId = teamId` only where the existing transitional ownership is already known.
3. Preserve `teamId` during the compatibility period; do not drop or rename it.
4. Make application reads strict immediately: only assets whose `workspaceId` equals the validated active workspace are visible.
5. Quarantine remaining null assets from user-facing repository APIs until an Owner selects their destination workspace.
6. Validate ownership counts and AI processing in a staging or backup-restorable environment.
7. In a separately approved destructive migration, assign every remaining null asset, make `workspaceId` non-null, and remove the deprecated `teamId` column.

This increment performs steps 1–5 only. It does not delete asset data, remove columns, or add a non-null constraint.

## Database Changes

- Added nullable `Assets.workspaceId` referencing `Teams.id` (`Team` remains the current database name for a workspace).
- Added the `assets_workspace_id` index for list, search, and dashboard filtering.
- Kept deprecated `Assets.teamId` temporarily for rollback compatibility.
- Added a migration and startup backfill that copy only non-null, already-known `teamId` assignments.
- New uploads write the validated workspace to `workspaceId` and temporarily dual-write `teamId`.
- No column was dropped and no non-null constraint was added.

## API Changes

- The frontend sends canonical `X-Workspace-Id`; `X-Team-Id` remains a temporary alias.
- Authentication validates that the requesting user is a member of that workspace and sets `req.user.workspaceId` plus the workspace role.
- Every user-facing asset route requires an active workspace before RBAC evaluation.
- Direct asset routes load the asset's `workspaceId` and reject cross-workspace or null-workspace access before the controller runs.
- Asset Detail responses now expose `workspaceId` instead of relying on uploader ownership.
- The internal asset-info and AI-result routes require `X-AI-Service-Token`. The existing worker sends this header from Docker configuration.

## Search Changes

`GET /api/assets/search` always appends `{ workspaceId: activeWorkspaceId }` to filename, metadata, manual-tag, AI-tag, type, date, and creator filters before pagination. There is no null or global fallback. Therefore `car` in Workspace B cannot match `car.fbx` or its semantic tags in Workspace A.

## Dashboard Changes

Asset totals, recent uploads, and comment totals use the same strict workspace predicate. Member totals and recent members use the matching workspace membership. A new workspace therefore starts with zero assets, no recent uploads, and zero comments; its creator is correctly counted as the first workspace member.

## AI Processing Compatibility

The AI queue and worker identify assets by their globally unique asset ID. CLIP, KeyBERT, Whisper, YAMNet, 3D extraction, and 3D semantic tagging do not require workspace-aware model changes. The internal worker information and result payloads are unchanged, while their HTTP calls now include a worker-only service credential. User-facing AI metadata reads inherit workspace isolation from the asset metadata route.

## Test Scenarios

Automated scenarios:

1. Workspace A uploads `car.fbx`; Workspace B cannot list, search, preview, download, or inspect it.
2. Searching `car` in Workspace B returns zero results.
3. A new workspace has zero assets, zero comments, and no recent uploads.
4. Owner, Manager, and Collaborator permissions apply only when their membership matches the asset workspace.
5. A legacy null-workspace asset is quarantined rather than exposed globally.
6. AI results continue to persist for workspace-owned image, text, audio, and 3D assets.

Results:

- Strict query predicate, cross-workspace denial, null-asset quarantine, upload ownership, empty dashboard, worker authentication, and startup backfill tests pass.
- All 29 backend tests pass.
- All 36 frontend tests pass, including canonical workspace-header propagation.
- Frontend lint and the optimized production build pass.
- Docker Compose configuration, Swagger parsing, backend JavaScript syntax, and AI worker Python syntax pass.
- Live two-workspace PostgreSQL and MinIO verification remains pending because the local Docker service is unavailable.
