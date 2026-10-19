# Drive/iPhone feasibility prototype

This is an isolated technical prototype. It does not choose the product stack or provide a production-ready multi-user service. The approved plan is in [`docs/plans/0001-drive-ios-feasibility.md`](../../docs/plans/0001-drive-ios-feasibility.md).

## Google Cloud setup

1. In your existing Google Cloud project, enable **Google Drive API** and **Google Picker API**.
2. Configure an external OAuth consent screen for Gmail accounts. Add your Gmail address as a test user while the app is in Testing. Request `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`; do not request full-Drive scopes.
3. Create a **Web application** OAuth client. For local testing, add `http://localhost:8765` as an authorized JavaScript origin and `http://localhost:8765/oauth/callback` as an authorized redirect URI. Adjust both if `BASE_URL` changes.
4. Create an API key for Google Picker. Follow Google's [Picker API key restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker), including the application's origin and `https://docs.google.com/*` if the key uses website restrictions.
5. Create a service account. Keep its JSON key **outside this repository** and set its absolute path in `.env`. Do not paste it into chat.
6. In My Drive, create a **dedicated empty test folder**. Share only this folder with the service-account email as **Editor**. Avoid testing with a folder containing valuable files.
7. Copy `.env.example` to `.env` in this directory and fill the values. The local file is ignored by Git.

`GOOGLE_PROJECT_NUMBER` is the numeric Cloud project number, not the project ID. `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` must be an absolute path outside the repository.

## Run locally

From `spikes/drive-ios`:

```powershell
npm.cmd ci
npm.cmd start
```

Open `http://localhost:8765` on the development computer. The prototype runs with one server-only dependency, Google's `google-auth-library`. The OAuth session and selected folder exist only in memory; restarting the server requires signing in and selecting the folder again. Google Picker receives a short-lived `drive.file` access token in the browser, as required by its API. The service-account key never goes to the browser.

If the inline **Chọn thư mục** dialog cannot access the Google account on iPhone, use **Chọn thư mục qua Google**. This approved feasibility fallback redirects through Google's full-page authorization and Picker flow, filtering for folder MIME types. It requests only `drive.file`, verifies the returned token belongs to the signed-in Gmail using Drive `about.get` with only `user.emailAddress`, and then applies the same My Drive ownership check. The existing `/oauth/callback` URI is reused; no additional Cloud credential or API key is needed. The user confirmed folder selection, Editor verification, scanning, and playback on iPhone; this remains a prototype. See [`docs/plans/0002-picker-redirect-fallback.md`](../../docs/plans/0002-picker-redirect-fallback.md).

The diagnostic page `/playback-spike` compares the current source-switching player with a two-element player. Choose two test tracks, press **Phát thử**, and wait until it says the entire next track (maximum 25 MiB) is loaded and ready before locking the iPhone. The next track is fetched from the same authorized `/audio/:id` route and held only in browser memory. Its log records media state without track names, file IDs, URLs, or tokens. See [`docs/plans/0003-ios-background-next-track.md`](../../docs/plans/0003-ios-background-next-track.md).

The upload button accepts a small sample file (5 MB maximum) to prove user-owned upload. For larger audio files, put them directly into `incoming/` on Drive and press **Quét lại**. The prototype deliberately has no bulk uploader.

## Planned checks

- Sign in with the Gmail test user and select the shared folder using Google Picker.
- Verify the service account can list the folder and detect a new audio file placed there manually.
- Verify the service account cannot read a different, unshared folder or file.
- Create `incoming/` and `songs/` with the user's OAuth grant, upload a small sample audio file, and move only a file that the user explicitly selects.
- Stream a sample song with byte-range support; test Safari and the Home Screen web app on a real iPhone, including playback after locking the screen, seeking, and advancing to the next song.

The iPhone test needs an HTTPS URL reachable from the phone. A local `localhost` URL on the development computer is insufficient; the HTTPS endpoint and matching OAuth redirect URI will be configured before that check.

### Temporary iPhone HTTPS test with ngrok

This phase was approved for the dedicated test folder only. Use an installed ngrok client; the exact local version may change. The user creates their own free ngrok account, finds the assigned dev domain under **Gateway → Domains**, and adds the ngrok authtoken locally using the [official setup instructions](https://ngrok.com/download/windows). Never send the token through chat or save it in this repository. Open a new PowerShell terminal after installation so the `ngrok` command is on `PATH`.

Once the dev domain is known, set `BASE_URL=https://<dev-domain>` in the ignored `.env` file. In the Google OAuth Web client, add the same HTTPS origin and `https://<dev-domain>/oauth/callback`. In the Picker API key's website restrictions, add `https://<dev-domain>/*`. Keep the existing localhost entries for local testing. Restart the prototype so it reads the new `BASE_URL`, then run `ngrok http 8765 --url https://<dev-domain>` in a separate terminal. Verify the public URL loads before opening it on the iPhone. Google's OAuth redirect URI must match exactly.

The tunnel exposes the prototype and sample audio through ngrok while it runs. Use only the test Gmail/folder and stop the tunnel after Safari and Home Screen checks. Restore `BASE_URL=http://localhost:8765` for ordinary local testing. If Google rejects the temporary domain, record the error and stop; do not widen Drive permissions.

For the outside-folder control, create a harmless test file in a **different** folder in the same My Drive account and do not share it with the service account. Copy only its Drive file ID and run:

```powershell
node --env-file=.env check-outside-access.mjs <unshared-test-file-id>
```

This standalone check requests only the test file's ID metadata. `PASS` means Google returned 403 or 404; `FAIL` means the service account already has access. A failure must be investigated before continuing. Do not use a private or valuable file for this check. This control checks Google's grant. After signing into the web prototype, also open `/audio/<unshared-test-file-id>` on the same origin; it must return HTTP 403 because the file was never listed inside the chosen folder.

For the iPhone check, open the HTTPS URL in Safari, then use Safari's Share menu to add the page to the Home Screen. Test Safari and the Home Screen icon separately and record the iOS version in `RESULTS.md`.

If the Home Screen app changes to the next track but becomes silent while locked, open **Chẩn đoán phát nhạc** after bringing it back to the foreground. The on-device log keeps the last 80 playback events and numeric media state across app reopen; **Sao chép chẩn đoán** copies it for analysis. It does not record song names, Drive IDs, URLs, or tokens. Check whether the log contains `page opened mode=standalone`, then reproduce the transition and capture the events around `ended`, `source changed`, `play resolved`/`play rejected`, and `playing`.

Record the outcomes in [`RESULTS.md`](RESULTS.md). Do not mark a case as passed based on static inspection alone.

## Safety

- The prototype must never receive broad user Drive scopes.
- Keep Google keys, OAuth secrets, access tokens, and music contents out of logs and Git.
- Stop if Google returns a permissions error; do not widen the scope without a new design review.
- No production data or public multi-user deployment is intended for this prototype.
