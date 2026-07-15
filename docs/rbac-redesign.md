# Workspace RBAC Redesign

## Status

Implemented as a backward-compatible migration increment on 2026-07-14.

## Account and Membership Model

- A newly registered account has the account role `user` and no asset-repository access.
- A User can create a team or join one with an invite code.
- Creating a team creates an `owner` membership for the creator.
- Joining a team creates a `collaborator` membership by default.
- Team membership roles are stored independently in `TeamMembers` and are evaluated in the active team context.
- Existing `admin`, `developer`, `designer`, and `collaborator` account roles continue to work for installations that have not completed team migration.

## Permission Matrix

| Capability | Owner | Manager | Collaborator | User |
| --- | --- | --- | --- | --- |
| View, preview, search, download | Yes | Yes | Yes | No |
| Comment and reply | Yes | Yes | Yes | No |
| Upload and edit metadata | Yes | Yes | No | No |
| Manage versions and approvals | Yes | Yes | No | No |
| Delete assets | Yes | No | No | No |
| Invite/remove members and assign roles | Yes | No | No | No |

Legacy Developer and Designer permissions remain compatible with the previous management behavior. Legacy Administrator retains system-user administration separately from team Owner permissions.

## Authentication Context

JWT continues to identify the authenticated account. The frontend adds canonical `X-Workspace-Id` (and a temporary `X-Team-Id` compatibility alias) when a workspace is active. The authentication middleware verifies membership and sets the request's effective `workspaceId` and `teamRole`. This database validation means membership removal or a role change takes effect on the next request rather than waiting for JWT expiry.

## Team APIs

- `GET /api/teams` lists the account's memberships.
- `POST /api/teams` creates a team and Owner membership.
- `POST /api/teams/join` joins by invite code as Collaborator.
- `GET /api/teams/current` returns the active team and member list.
- `PATCH /api/teams/current/members/:userId` changes a member role.
- `DELETE /api/teams/current/members/:userId` removes a member.
- `POST /api/teams/current/invite-code` rotates the invite code.

Owner operations prevent removal or demotion of the final Owner.

## Asset Ownership Migration

New uploads store the active `workspaceId`. Direct access, search, and dashboard queries require exact workspace equality. Legacy assets whose workspace remains null are quarantined until an Owner-approved migration assigns them; they are never exposed through a global fallback.

## Frontend Flow

Registration now leads to Workspace Onboarding instead of immediately granting Collaborator access. The onboarding screen supports Create Team and Join Team paths. The Team screen shows members and roles to all members, while Owner-only controls expose invite-code rotation, role assignment, and member removal. Desktop and mobile navigation include an active-workspace selector backed by `GET /api/teams`; selecting a membership persists its team and role before returning to the Dashboard. Navigation and action controls use the same centralized permission matrix as the API.

The legacy `/admin/users` interface is labeled System User Administration and remains distinct from workspace membership. Only the global Administrator account permission exposes it; team Owners use `/team` instead.

## Risks and Deferred Work

- Legacy null-workspace assets remain unavailable until ownership migration is completed.
- Project-level and asset-level Manager assignments are not separate records yet; Manager is currently team-scoped.
- The AI result callback remains on its existing internal-service contract and was not changed by this RBAC increment.

## Validation

- Backend: 29 tests passed, including workspace role boundaries, strict asset isolation, empty-workspace dashboard scope, worker authentication, and legacy Administrator behavior.
- Frontend: 36 tests passed, including permission mapping, `X-Workspace-Id` propagation, multi-workspace selection, route announcements, and legacy administration labeling.
- Frontend lint passed.
- Optimized production build completed successfully.
