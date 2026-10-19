# 0001 — Drive boundary and credentials

Status: Accepted (19/10/2026, phases 1–2 of plan 0004)

## Context

Each Gmail user chooses one My Drive folder. A shared service account may have access to folders belonging to many users. The app needs durable sign-in and limited Drive access.

## Alternatives

- Browser-only tokens: simple, but sessions and folder binding disappear across devices.
- Broad user Drive scope: easier enumeration, but exceeds the user's folder-only requirement.
- One shared service account with server-enforced folder ancestry: fits the proven prototype, provided every read is scoped to the signed-in user's root.

## Decision

- Use Google `openid email profile drive.file` with server-side OAuth code flow. The full-page Google folder picker is used because the embedded picker failed on the tested iPhone.
- Store only the user refresh token, encrypted with AES-256-GCM and a versioned server key. Store a hash of the session cookie in PostgreSQL; the cookie is HttpOnly, SameSite=Lax and persists for one year without an inactivity timeout.
- Bind one root folder to each Google subject. The first version does not switch roots after selection.
- The service account is Editor on that root. Before each scan or stream, verify that saved `incoming/` and `songs/` are direct children of the current user's root; discover audio only by listing those folders and direct song containers. Do not fetch a caller-supplied Drive ID before establishing membership through those listings.
- A scan may return the containing folder ID as a playback hint. Before streaming, the server checks that hint against the current root tree and re-lists the hinted folder to confirm the requested file is still there. An absent hint uses the original full scan path. The hint never grants access by itself.
- Keep Drive files as source data. PostgreSQL stores account, session, folder binding and audit metadata in phases 1–2.

## Rationale

The server needs a stable folder binding across devices. Google permission alone does not isolate users because the bot can access multiple shared folders. The app therefore checks the folder tree for every media request.

## Consequences

- Rechecking the current root and file membership for every media request costs Drive API calls. The containing-folder hint avoids listing unrelated song folders; a later indexed route may improve this further only while retaining a current ancestry check.
- Key rotation needs an explicit re-encryption process before retiring old keys.
- The first deployment is one long-running Node process; its in-memory rate limiter must move to shared storage before horizontal scaling.
- Revoking Google access or removing the bot share stops related operations; it does not delete the user's Drive files.
