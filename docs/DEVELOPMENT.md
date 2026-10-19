# Drive Player development

The product is one Next.js App Router application at the repository root. `spikes/drive-ios` remains a separate proof of concept. Use Node 24 and Corepack pnpm 10.16.0. The local PostgreSQL 18 development database was configured by the user on 19/10/2026; its credentials stay outside version control.

## Configure locally

1. Copy the root `.env.example` to a new root `.env`. Set a dedicated PostgreSQL database URL and a random 32-byte base64 `TOKEN_ENCRYPTION_KEY_V1`. Keep both outside version control.
2. Reuse the Google OAuth client and service account from the prototype if desired. Set the absolute service-account JSON path outside this repository. The app reads its `client_email` to show the address to share with Editor access.
3. Add `http://localhost:3000/v1/auth/google/callback` as an authorized redirect URI in Google Auth Platform. `APP_BASE_URL` must equal the browser origin. For a later HTTPS origin, add the matching redirect URI and set the deployed environment separately.
4. Create a dedicated, empty `drive_player` database and user. Review `prisma/migrations/20261019000000_foundation/migration.sql` before applying it. No existing database should be reused without a separate migration plan.
5. With the database configured, use `corepack pnpm db:migrate`, `corepack pnpm db:generate`, then `corepack pnpm dev`. The first migration is applied on the current local development database; other installations still need this step.

The old prototype used an API key for an embedded Picker. The new full-page Google Picker flow uses the OAuth client and does not need `GOOGLE_API_KEY` or `GOOGLE_PROJECT_NUMBER`.

## Current route and data boundary

- `/v1/auth/google/start` and callback establish an encrypted refresh token and a persistent session.
- `/v1/folders/pick` selects one folder through Google's full-page Picker. The selection is locked after first binding in version 1.
- `/v1/folders/verify` and `/v1/folders/setup` confirm bot Editor access and create/reuse `incoming/` and `songs/`.
- `/v1/library/scan` lists files in the saved folders and returns each candidate's containing folder. `/v1/preview-audio/:fileId` accepts that folder as an optional `parent` hint, rechecks the root path and the file's current membership, then proxies byte ranges. Without the hint it scans the whole allowed tree. The Drive ID in this route is a preview candidate, not a future imported track ID.
- Session and JSON APIs use `/v1`; OAuth redirects and audio streams have their own response formats.

The initial migration creates `users`, `google_credentials`, `sessions`, `libraries` and `audit_events`. Tracks, import operations, playlists and lyrics are deferred to the approved later stages. No existing data is transformed. Until release planning approves a backup/rollback procedure, do not apply migrations to a database holding user data.

## Local verification status

The user confirmed Google login, folder selection, Editor verification and folder setup on the local Next.js app. Database inspection found one active session and one ready library with audit entries for the three folder actions. Logging in with the same Gmail in Edge InPrivate opened the existing library without folder selection. Two small audio files played. An 8.5 MB MP3 initially paused after Edge suspended fetching near 149 of 209 seconds; after requesting `preload="auto"` for files up to 25 MiB, the user observed the buffer reach the end, seeking near the end and normal completion. Edge can still suspend an incomplete buffer, so this is not a guarantee of uninterrupted playback on every browser or network. The isolated queue page has now also been tried on iPhone; see below.

The root player now records milliseconds from a click to `loadedmetadata`, `canplay` and `playing` in its local diagnostics. Audio responses include a `Server-Timing` header with session lookup, Drive folder authorization and upstream response durations. These timings have not yet been measured after this change.

## Not yet implemented

Web upload, confirmed import, metadata index/search, playlists, favorites, lyrics, production queue and next-track preload are phases 3–5. The isolated scan-list experiment below does not replace those product features. Production hosting, public domain, shared rate limiting, operational backup and multiuser load testing are separate deployment work.

## Scan-list queue experiment (Edge and iPhone observations)

The isolated `/queue-spike` page uses the current scan order as a temporary queue; it does not create a playlist or change the database. Open the page from the library after signing in and preparing the Drive folder. Click **Quét thư mục**, then **Phát từ đây**. The active track streams through the existing authorized Range route. After roughly 12 seconds of active-track audio is buffered (or the whole track), the page tries to fetch the nearest next track fully (within a 50 MiB session cache) and load it into a second audio element. It reserves up to 512 KiB for each of the next two tracks and pauses prefetch if the active track's buffer falls below roughly 4 seconds. A prefix is completed to a full Blob only when that track becomes nearest; if not ready at transition, playback falls back to the direct route. Back reuses a complete cached Blob if it survives eviction, otherwise reloads from Drive.

Prefetch requests carry the scan result's Drive MD5 as a revision hint. The server rechecks folder membership and rejects a changed version before returning the requested Range. The cache is held only in the current tab and is cleared when the experiment stops or closes. Existing audio playback remains on the root page for comparison. The direct first track is not copied into the app-managed cache, so Back to that track may reload even below the 50 MiB cap.

The user supplied an Edge diagnostics log on 19/10/2026: the initial direct stream emitted `playing` after 4.289 seconds; ready standby transitions emitted `playing` after 4–9 ms; full cached tracks after Back emitted `playing` after 14–28 ms; one uncached direct transition emitted `playing` after 3.522 seconds. The user confirmed the audible behavior matched those events. On iPhone background playback, the standby element sometimes advanced to roughly 127–131 seconds before promotion and one active element jumped from roughly 15 to 167 seconds after reopening. The queue experiment now pauses/resets a drifting standby element, resets a new track's start position before playback, and updates Media Session position from the active element. The user reported one successful retest in the Home Screen web app: track transitions, reopening and Dynamic Island position were correct. Safari initially showed "Loading…"; opening the tunnel's root page, accepting ngrok's browser warning and reloading let the user enter the app. In a first Safari background attempt, the user sought the active track near its end before the next track was ready; the direct-stream fallback emitted `playing` while hidden but remained at time zero for more than 12 seconds. The page now displays whether the next full track is ready. In a repeat Safari test without seeking, the user waited for the ready message and confirmed the next track started at zero with continuous sound while the screen was locked. The direct-stream fallback in background remains unreliable. The experiment has not been typechecked or built by the agent under the project verification policy.
