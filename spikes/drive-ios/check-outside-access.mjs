import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const outsideFileId = process.argv[2];
const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
if (!/^[A-Za-z0-9_-]{10,}$/.test(outsideFileId || '') || !keyPath || !isAbsolute(keyPath)) {
  throw new Error('Usage: node --env-file=.env check-outside-access.mjs <unshared-test-file-id>');
}

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const resolvedKeyPath = realpathSync(keyPath);
const keyRelativePath = relative(repository, resolvedKeyPath);
if (keyRelativePath === '' || (!keyRelativePath.startsWith('..') && !isAbsolute(keyRelativePath))) {
  throw new Error('The service-account key must be stored outside the repository');
}
if (!JSON.parse(readFileSync(resolvedKeyPath, 'utf8')).client_email) {
  throw new Error('Service-account key has no client_email');
}

const auth = new GoogleAuth({
  keyFile: resolvedKeyPath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const access = await (await auth.getClient()).getAccessToken();
if (!access.token) throw new Error('Could not obtain service-account access token');

const url = new URL(`https://www.googleapis.com/drive/v3/files/${outsideFileId}`);
url.searchParams.set('fields', 'id');
const response = await fetch(url, { headers: { Authorization: `Bearer ${access.token}` } });
if (response.status === 403 || response.status === 404) {
  process.stdout.write(`PASS: Drive denied metadata access to the unshared test file (HTTP ${response.status}).\n`);
} else if (response.ok) {
  process.stderr.write('FAIL: The service account can access the outside test file. Check its existing shares.\n');
  process.exitCode = 1;
} else {
  process.stderr.write(`INCONCLUSIVE: Drive returned HTTP ${response.status}. Check Google Cloud configuration.\n`);
  process.exitCode = 2;
}
