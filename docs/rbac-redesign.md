# Workspace RBAC Redesign

## Status

Implemented on 2026-07-14. Canonical role values were updated on 2026-10-07.

## Account and Membership Model

- A newly registered account has the account role `user` and no asset-repository access.
- A User can create a team or join one with an invite code.
- Creating a team creates a `workspaceOwner` membership for the creator.
- Joining a team creates a `collaborator` membership by default.
- Team membership roles are stored independently in `TeamMembers` and are evaluated in the active team context.
- Account roles are `user` and `systemAdministrator`. Workspace roles are `workspaceOwner`, `workspaceManager`, and `collaborator`.
- The role migration converts legacy `admin` to `systemAdministrator`, legacy `developer`, `designer`, and account-level `collaborator` to `user`, and workspace `owner`/`manager` to `workspaceOwner`/`workspaceManager`. Existing memberships remain attached to their accounts.

## Permission Matrix

| Capability | Workspace Owner | Workspace Manager | Collaborator | User |
| --- | --- | --- | --- | --- |
| View, preview, search, download | Yes | Yes | Yes | No |
| Comment and reply | Yes | Yes | Yes | No |
| Upload and edit metadata | Yes | Yes | No | No |
| Manage versions and approvals | Yes | Yes | No | No |
| Delete assets | Yes | No | No | No |
| Invite/remove members and assign roles | Yes | No | No | No |

`systemAdministrator` is the only platform administrator role. It is restricted to System Administration and receives no workspace, team-invitation, or asset permission from the account role.

## Authentication Context

JWT continues to identify the authenticated account. The frontend adds canonical `X-Workspace-Id` (and a temporary `X-Team-Id` compatibility alias) when a workspace is active. The authentication middleware verifies membership and sets the request's effective `workspaceId` and `teamRole`. This database validation means membership removal or a role change takes effect on the next request rather than waiting for JWT expiry.

## Team APIs

- `GET /api/teams` lists the account's memberships.
- `POST /api/teams` creates a team and Workspace Owner membership.
- `POST /api/teams/join` joins by invite code as Collaborator.
- `GET /api/teams/current` returns the active team and member list.
- `PATCH /api/teams/current/members/:userId` changes a member role.
- `DELETE /api/teams/current/members/:userId` removes a member.
- `POST /api/teams/current/invite-code` rotates the invite code.

Workspace Owner operations prevent removal or demotion of the final Workspace Owner.

## Asset Ownership Migration

New uploads store the active `workspaceId`. Direct access, search, and dashboard queries require exact workspace equality. Legacy assets whose workspace remains null are quarantined until an Owner-approved migration assigns them; they are never exposed through a global fallback.

## Frontend Flow

Registration now leads to Workspace Onboarding instead of immediately granting Collaborator access. The onboarding screen supports Create Team and Join Team paths. The Team screen shows members and roles to all members, while Owner-only controls expose invite-code rotation, role assignment, and member removal. Desktop and mobile navigation include an active-workspace selector backed by `GET /api/teams`; selecting a membership persists its team and role before returning to the Dashboard. Navigation and action controls use the same centralized permission matrix as the API.

The `/admin/users` interface is the System Administration module and remains distinct from workspace membership. Only the global System Administrator account permission exposes it; team Owners use `/team` instead. Account deactivation uses `Users.isActive`, preserves related records, and blocks existing JWT sessions on their next protected request.

## Risks and Deferred Work

- Legacy null-workspace assets remain unavailable until ownership migration is completed.
- Project-level and asset-level Workspace Manager assignments are not separate records yet; Workspace Manager is currently team-scoped.
- The AI result callback remains on its existing internal-service contract and was not changed by this RBAC increment.

## Validation

- Backend: 46 tests passed, including canonical role migration and permission boundaries.
- Frontend: 50 tests passed, including permission mapping and workspace role presentation.
- Optimized production build completed successfully.
