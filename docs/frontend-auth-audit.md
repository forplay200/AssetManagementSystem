# Frontend Authentication Audit

## Login Response

The backend `POST /api/auth/login` response is:

```json
{
  "token": "<signed JWT>",
  "user": {
    "id": 1,
    "username": "example",
    "email": "example@studio.com",
    "role": "developer"
  }
}
```

The frontend now validates that a token exists before treating login or registration as successful. It also normalizes the legacy `accessToken` response name to `token` for backward compatibility.

## Token Storage Location

- Storage mechanism: browser `localStorage`
- Storage key: `aether.session`
- Stored value: JSON containing `{ token, user }`
- Refresh behavior: `AuthContext` reads and validates the stored JWT during initialization, restores the user session, and synchronizes Axios' default authorization header.
- Expired, malformed, or unreadable sessions are removed.

## Axios Interceptor Behavior

The shared Axios instance in `frontend/src/services/api.js` is used by authentication and asset services. Before each request, the interceptor reads the current session and sets the header through Axios' header API when available:

```text
Authorization: Bearer <token>
```

Axios defaults are also updated immediately after login/registration and cleared on logout or an invalid/unauthorized session response. This removes the timing dependency between React state changes and the next asset request.

## Headers Sent to Assets APIs

Every request made by `assetService` uses the shared Axios instance. Authenticated requests to search, detail, metadata, tags, preview, upload, download, delete, versions, comments, and dashboard APIs therefore receive:

```http
Authorization: Bearer <signed JWT>
```

Multipart upload requests additionally include their multipart content type. Blob preview/download requests retain the authorization header.

## Fixes Applied

- Added one shared auth-storage module so `AuthContext` and Axios cannot drift to different storage keys or parsing behavior.
- Synchronized Axios' default authorization header during session restoration, login, registration, logout, and session expiry.
- Hardened the request interceptor for Axios header objects and plain header objects.
- Removed stale authorization defaults when no stored token exists.
- Validated and normalized login and registration token responses.
- Added automated coverage for persisted asset-request headers, default-header synchronization, login response normalization, legacy token compatibility, and missing-token rejection.
- No backend code or API behavior was changed.
