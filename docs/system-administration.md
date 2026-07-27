# System Administration

## Existing Capability Audit

Before this increment, `/api/users` already provided an Administrator-protected user list and `/api/users/:id` returned a basic account record. The React System Users page also had local username/email filtering. These capabilities were reused.

The previous module also exposed account creation, arbitrary account editing, password replacement, role mutation, and physical user deletion. Those operations do not belong to the redesigned System Administrator use cases and conflicted with the requirement to preserve accounts. They were removed from the mounted System Administration contract.

Missing capabilities were account activation status, server-side search, workspace role visibility in user details, immediate blocking of deactivated sessions, and activation/deactivation controls.

## Role Model

`systemAdministrator` is the canonical platform account role. Existing `admin` database values remain accepted as a compatibility alias. Neither value grants workspace, team invitation, or asset permissions. Owner, Manager, Collaborator, and User cannot satisfy the platform-level `manageUsers` permission.

The first platform administrator remains a deployment-provisioned account. Existing `admin` accounts can use the module immediately after migration; public registration cannot grant either administrator role.

## Account Status

`Users.isActive` is a non-null Boolean with a default of `true`. The additive migration preserves every existing user and marks existing rows active by default. Deactivation never deletes the user or their related records.

Inactive accounts:

- Cannot sign in.
- Are rejected on protected requests even when an older JWT has not expired.
- Have pending password-recovery tokens cleared.

A System Administrator cannot deactivate their own active account.

## API Contract

- `GET /api/users?q=&status=&role=` lists and searches registered users.
- `GET /api/users/:id` returns account details plus read-only workspace role assignments.
- `PATCH /api/users/:id/status` accepts `{ "status": "active" }` or `{ "status": "inactive" }`.

All routes use authentication plus the account-level `manageUsers` permission. Workspace roles are deliberately ignored for this authorization decision.

## Frontend Module

The System Users page provides:

- Server-backed username/email search.
- Account status and account-role filters.
- Active and Inactive badges.
- A user-detail modal with read-only workspace assignments.
- Activate and Deactivate actions.
- Self-deactivation protection.

System Administration navigation and routes are hidden from Owner, Manager, Collaborator, and User. System Administrator sessions are redirected away from workspace screens and do not receive workspace navigation or asset search controls.

## Excluded Scope

- Forgot Password and Reset Password
- User password replacement
- Workspace role modification
- Team invitations
- Workspace asset operations
- Physical account deletion

## Test Scenarios

- System Administrator and legacy `admin` can access system-user APIs.
- Owner, Manager, Collaborator, and User cannot access the module.
- Search filters reach the backend query.
- User details include workspace assignments without mutation controls.
- Activation and deactivation update `isActive` without destroying the user.
- Inactive accounts are blocked with both new login attempts and existing JWTs.

Automated validation: 44 backend tests and 49 frontend tests pass, along with frontend lint, Swagger parsing, migration syntax, and the optimized production build.
