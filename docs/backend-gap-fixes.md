# Backend Gap Fixes

## Issue
Search queried generated storage filenames instead of original upload names, and metadata search applied `LIKE` directly to a PostgreSQL JSON column.

## Analysis
Generated MinIO keys retain extensions but not meaningful base names, explaining why extension-only filename searches appeared successful. PostgreSQL does not define the text `LIKE` operator for JSON, so metadata requests failed. AI `q` filtering also ran after database pagination, causing incomplete results and counts.

## Solution
Search now prioritizes case-insensitive `originalname` matching with a storage-key fallback, casts metadata JSON to text before matching, filters the AI metadata subtree before pagination, and retains AI match-source scoring. The frontend now exposes the canonical `q` parameter.

## Files Modified
- `backend/src/controllers/assetsController.js`
- `backend/src/utils/searchQuery.js`
- `backend/__tests__/searchQuery.test.js`
- `backend/package.json`
- `backend/swagger.yaml`
- `frontend/src/pages/SearchPage.jsx`

## API Changes
- Existing `GET /api/assets/search` route is unchanged.
- `filename` now matches `originalname` first.
- `metadata`, `q`, and `aiTag` now use PostgreSQL-safe JSON text search.

## Risks
- Text-casting JSON with leading and trailing wildcards cannot use a conventional B-tree index. A PostgreSQL text-search or trigram index should be considered if repository scale makes search latency exceed the PRD target.
- The generated filename fallback is retained for compatibility and may return storage-key matches in addition to original-name matches.

## Status
Fixed

## Issue
Metadata Text search matched JSON property names as well as metadata values.

## Analysis
Casting the complete metadata JSON object to text includes both keys and values. A search for `type` therefore matched the serialized `"type"` key even when none of the stored values contained that word.

## Solution
Replaced whole-object text matching with a PostgreSQL JSONPath expression that recursively extracts only string, number, and boolean scalar values. The resulting value array is cast to text for case-insensitive partial matching; object and array keys are excluded.

## Files Modified
- `backend/src/utils/searchQuery.js`
- `backend/__tests__/searchQuery.test.js`
- `docs/search-integration-audit.md`

## API Changes
- No parameter or response change. `GET /api/assets/search?metadata=...` now searches values only.

## Risks
- PostgreSQL JSONPath requires PostgreSQL 12 or newer; the project uses PostgreSQL 15.
- Recursive JSON value extraction is correct but may need a specialized index or denormalized search column at larger repository scale.

## Status
Fixed

## Issue
Administrator user-management controllers existed, but `/api/users` was not mounted and `routes/users.js` imported the RBAC module as a callable function even though it exports `{ authorize }`.

## Analysis
The missing application mount caused every frontend user-management request to return 404. Mounting the router without correcting the import would fail when the route module loaded. The controller contract itself was usable and already excluded sensitive password/reset fields.

## Solution
Corrected the RBAC import, mounted the router at `/api/users` behind the API rate limiter, retained administrator-only authorization, added create/update validation, validated role values, and blocked deletion of the currently authenticated administrator.

## Files Modified
- `backend/src/index.js`
- `backend/src/routes/users.js`
- `backend/src/controllers/userController.js`
- `backend/swagger.yaml`
- `backend/__tests__/routes.test.js`

## API Changes
- Added live `GET /api/users`
- Added live `GET /api/users/:id`
- Added live `POST /api/users`
- Added live `PUT /api/users/:id`
- Added live `DELETE /api/users/:id`

## Risks
- Existing clients that attempted to delete their own active administrator account now receive HTTP 400.
- The API does not yet prevent demoting the last remaining administrator; that policy needs product review.

## Status
Fixed

## Issue
Password-recovery controller methods existed but no HTTP routes exposed them, and reset lookup compared the raw token with a hashed database value.

## Analysis
`User.generateResetToken()` stores a SHA-256 hash and returns the raw token. `resetPassword` previously queried the stored hash column with the raw token, so even a correctly issued token could never match. No mounted routes meant the controllers were unreachable in any case.

## Solution
Added validated `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` routes. Added a shared reset-token hashing utility and hash the submitted raw token before lookup. Updated the frontend recovery and reset screens to use the new endpoints.

## Files Modified
- `backend/src/routes/auth.js`
- `backend/src/controllers/authController.js`
- `backend/src/utils/resetToken.js`
- `backend/swagger.yaml`
- `backend/__tests__/resetToken.test.js`
- `backend/__tests__/routes.test.js`
- `frontend/src/services/authService.js`
- `frontend/src/pages/ForgotPasswordPage.jsx`
- `frontend/src/pages/ResetPasswordPage.jsx`
- `frontend/src/App.jsx`
- `frontend/src/App.test.jsx`

## API Changes
- Added `POST /api/auth/forgot-password`
- Added `POST /api/auth/reset-password`

## Risks
- The current development controller returns the raw reset token because no email delivery service exists. Production deployment should send the raw token out-of-band and omit it from the response.
- Previously issued tokens remain compatible because the stored and submitted values use the same SHA-256 scheme after this fix.

## Status
Fixed

## Issue
The request-validation middleware was a no-op.

## Analysis
Routes declared schemas, but `validate()` always called `next()`. Invalid emails, missing fields, short passwords, and wrong types reached controllers or the database, creating inconsistent errors and avoidable server failures.

## Solution
Implemented schema validation for required values, types, email format, and minimum string length. Added username validation to registration and validation schemas to user create/update routes. Errors use a stable `{ message, errors }` response.

## Files Modified
- `backend/src/middleware/validate.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/users.js`
- `backend/__tests__/validate.test.js`

## API Changes
- Invalid validated requests now return HTTP 400 with `message: "Validation failed"` and field-level errors.

## Risks
- Requests that previously passed through with malformed or incomplete data are now rejected. Valid request contracts are unchanged.

## Status
Fixed

## Issue
Public registration accepted a caller-supplied role, allowing self-registration as Administrator, Developer, or Designer.

## Analysis
The registration controller copied `req.body.role` directly into the new user. Role assignment is an administrator responsibility in the PRD, so this bypassed RBAC before the user-management API was involved.

## Solution
Public registration now creates Collaborators by default. A compatibility switch, `ALLOW_PUBLIC_ROLE_REGISTRATION=true`, can restore the old behavior for controlled legacy environments; it defaults to false and is documented in `.env.example`.

## Files Modified
- `backend/src/controllers/authController.js`
- `.env.example`

## API Changes
- `POST /api/auth/register` continues accepting the existing payload, but ignores `role` unless the explicit compatibility environment flag is enabled.

## Risks
- Legacy deployments that intentionally assigned roles through public registration must set the compatibility flag or migrate to the administrator user API.

## Status
Fixed

## Issue
The frontend could not determine asset ownership, so non-owner management roles saw edit/delete/version controls that the backend later rejected.

## Analysis
The legacy `/api/assets/:id/info` response omitted `userId` and was intentionally called without JWT by the AI worker. Adding ownership to that public response or requiring JWT would either expose more data or break AI processing.

## Solution
Added authenticated `GET /api/assets/:id/details`, returning the existing asset fields plus `userId` and `uploadedAt`. The frontend now uses this endpoint and only exposes owner-or-administrator mutation controls. The legacy `/info` endpoint remains unchanged for AI-worker compatibility.

## Files Modified
- `backend/src/routes/assets.js`
- `backend/src/controllers/assetsController.js`
- `backend/swagger.yaml`
- `backend/__tests__/assetsController.test.js`
- `frontend/src/services/assetService.js`
- `frontend/src/pages/AssetDetailPage.jsx`

## API Changes
- Added `GET /api/assets/:id/details` (JWT required)
- Retained `GET /api/assets/:id/info` unchanged

## Risks
- The legacy AI-worker endpoint remains unauthenticated. Securing it requires coordinated service authentication and is tracked separately.

## Status
Fixed

## Issue
Tag mutation routes required a `:tagId` path segment, but the controllers ignored it and required a tag name in the JSON body.

## Analysis
The route shape and implementation contract disagreed. The frontend previously supplied a dummy `0` segment to reach the controller. Removing the old route would break existing clients.

## Solution
Added canonical POST and DELETE handlers at `/api/assets/:assetId/tags` using `{ tag }` in the body. Retained the legacy `/:tagId` aliases. Updated the frontend to use the canonical contract and added owner-or-administrator checks to tag mutation controllers.

## Files Modified
- `backend/src/routes/assets.js`
- `backend/src/controllers/assetsController.js`
- `backend/swagger.yaml`
- `frontend/src/services/assetService.js`

## API Changes
- Added `POST /api/assets/:assetId/tags`
- Added `DELETE /api/assets/:assetId/tags`
- Retained `POST /api/assets/:assetId/tags/:tagId`
- Retained `DELETE /api/assets/:assetId/tags/:tagId`

## Risks
- Non-owner Developer and Designer users can no longer mutate another user's tags. This is an intentional security correction consistent with metadata ownership.

## Status
Fixed

## Issue
Specific version lookup used `req.params.assetId`, while the route defines the asset parameter as `:id`.

## Analysis
The controller queried `assetId: undefined`, so `GET /api/assets/:id/versions/:versionId` could not retrieve a valid version even though history and download routes used the correct asset identifier.

## Solution
Changed the lookup to use `req.params.id` and added a focused controller test.

## Files Modified
- `backend/src/controllers/assetsController.js`
- `backend/__tests__/assetsController.test.js`

## API Changes
- No route change; `GET /api/assets/:id/versions/:versionId` now works as documented.

## Risks
- None for valid callers; this corrects previously broken behavior.

## Status
Fixed

## Issue
Collaborators were authorized on every asset mutation route despite the PRD defining their role as view-and-feedback oriented.

## Analysis
Upload, metadata updates, tag mutation, version creation, deletion, and AI-job creation all listed Collaborator as an allowed role. Some controllers added owner checks, but Collaborators could upload and then manage their own assets, bypassing the intended role boundary.

## Solution
Separated view roles from management roles in the asset router. Collaborators retain search, preview, download, metadata/tag viewing, version viewing/downloading, dashboard access, and comments. Mutation routes now require Administrator, Developer, or Designer. Administrator version creation was also aligned with other owner-or-administrator mutations.

## Files Modified
- `backend/src/routes/assets.js`
- `backend/src/controllers/assetsController.js`
- `backend/__tests__/rbac.test.js`

## API Changes
- Existing mutation paths are unchanged, but Collaborator calls now return HTTP 403.

## Risks
- This intentionally removes mutation behavior that was technically available to Collaborators. It is a security correction aligned with the PRD and frontend permissions.

## Status
Fixed

## Issue
The backend test script did not run tests and only printed “Tests passed.”

## Analysis
Backend changes had no executable regression coverage, so route wiring, RBAC, validation, token hashing, and controller parameter bugs could recur unnoticed.

## Solution
Replaced the placeholder test script with Node's built-in test runner and added ten tests covering validation, RBAC, route availability, reset-token hashing, version lookup, and ownership details.

## Files Modified
- `backend/package.json`
- `backend/__tests__/validate.test.js`
- `backend/__tests__/rbac.test.js`
- `backend/__tests__/routes.test.js`
- `backend/__tests__/resetToken.test.js`
- `backend/__tests__/assetsController.test.js`

## API Changes
- None.

## Risks
- Tests use isolated controller/router mocks and do not replace full PostgreSQL, MinIO, Redis, or Docker integration tests.

## Status
Fixed

## Issue
The legacy AI worker reads asset info and posts AI results through unauthenticated endpoints.

## Analysis
Adding JWT authentication directly would break the current Python worker because it has no user session. A service token or signed internal request requires coordinated backend, AI-service, environment, deployment, and secret-rotation changes.

## Solution
Retained `/api/assets/:id/info` and `/api/assets/:id/ai-result` for backward compatibility. The user-facing frontend now uses the authenticated `/details` endpoint. A dedicated service-authentication design is recommended before changing the AI callbacks.

## Files Modified
- None for the legacy endpoints.

## API Changes
- None.

## Risks
- Anyone with network access to the backend may read limited asset storage information or submit AI metadata. Deployment network isolation is required until service authentication is implemented.

## Status
Needs Review

## Issue
The version-creation endpoint preserves the current file but does not accept a replacement file as a new version.

## Analysis
The PRD explicitly requires users to upload new asset versions. The existing endpoint only copied the current file into history, so it could not complete that workflow. Changing its request shape would break existing snapshot callers, and replacement files invalidate previously generated AI metadata.

## Solution
Retained the existing snapshot endpoint and added a separate multipart replacement endpoint. The replacement workflow preserves the previous file and its identifying data as a version, uploads the new current object, retains user-entered metadata, removes stale AI metadata, and queues fresh AI processing. Failure cleanup removes newly created objects and the incomplete version record when feasible.

## Files Modified
- `backend/src/controllers/assetsController.js`
- `backend/src/routes/assets.js`
- `backend/swagger.yaml`
- `backend/__tests__/assetsController.test.js`
- `frontend/src/services/assetService.js`
- `frontend/src/components/versions/VersionHistory.jsx`
- `frontend/src/pages/AssetDetailPage.jsx`

## API Changes
- Added `POST /api/assets/:id/versions/upload` using multipart fields `asset` and optional `changeLog`.
- Retained `POST /api/assets/:id/versions` unchanged for snapshot compatibility.

## Risks
- The MinIO and database operations are compensating rather than a single distributed transaction; an infrastructure failure during cleanup can leave an orphaned object that requires operational cleanup.
- Concurrent replacement requests can still race when deriving the next version number from the current count.

## Status
Fixed

## Issue
There is no self-service profile endpoint or dedicated asset-category resource.

## Analysis
The mounted user routes are intentionally administrator-only. Reusing them for profile editing would allow role manipulation unless a separate controller whitelist is introduced. Asset metadata is JSON and already supports storing a category without adding a new relational contract.

## Solution
Mounted administrator user management only. Retained profile editing as read-only and category as an editable metadata field. Separate self-service profile and category APIs should be designed only if those concepts need stronger validation or reporting.

## Files Modified
- None beyond the administrator user API and existing metadata frontend changes.

## API Changes
- No self-service profile or category endpoints added.

## Risks
- Users cannot change their own username/email, and categories have no controlled vocabulary.

## Status
Deferred
