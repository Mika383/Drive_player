import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { appOrigin, googleConfig, serviceAccount } from "./config";
import { decryptRefreshToken } from "./crypto";
import { AppError } from "./errors";
import type { AuthSession } from "./session";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export function oauthClient(): OAuth2Client {
  const { clientId, clientSecret } = googleConfig();
  return new OAuth2Client(clientId, clientSecret, `${appOrigin()}/v1/auth/google/callback`);
}

export function loginUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["openid", "email", "profile", DRIVE_FILE_SCOPE],
    include_granted_scopes: false,
    state,
  });
}

export function pickerUrl(state: string, email: string): string {
  const url = new URL(oauthClient().generateAuthUrl({
    access_type: "online",
    scope: [DRIVE_FILE_SCOPE],
    include_granted_scopes: false,
    prompt: "consent",
    login_hint: email,
    state,
  }));
  url.searchParams.set("trigger_onepick", "true");
  url.searchParams.set("allow_folder_selection", "true");
  url.searchParams.set("mimetypes", "application/vnd.google-apps.folder");
  return url.href;
}

export async function userAccessToken(session: AuthSession): Promise<string> {
  const credential = session.user.credential;
  if (!credential || credential.revokedAt) throw new AppError(401, "GOOGLE_REAUTH_REQUIRED", "Hãy kết nối lại tài khoản Google.");
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptRefreshToken(credential) });
  try {
    const result = await client.getAccessToken();
    if (!result.token) throw new Error("Missing access token");
    return result.token;
  } catch {
    throw new AppError(401, "GOOGLE_REAUTH_REQUIRED", "Quyền Google đã hết hiệu lực. Hãy đăng nhập lại.");
  }
}

let serviceAuth: GoogleAuth | undefined;
export async function botAccessToken(): Promise<string> {
  serviceAuth ??= new GoogleAuth({ keyFile: serviceAccount().path, scopes: [DRIVE_SCOPE] });
  try {
    const result = await (await serviceAuth.getClient()).getAccessToken();
    if (!result.token) throw new Error("Missing service token");
    return result.token;
  } catch {
    throw new AppError(502, "DRIVE_UNAVAILABLE", "Không lấy được quyền đọc thư viện Drive.");
  }
}
