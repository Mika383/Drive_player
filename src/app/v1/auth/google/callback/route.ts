import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { appOrigin, googleConfig } from "@/server/config";
import { encryptRefreshToken } from "@/server/crypto";
import { verifyOwnedFolder } from "@/server/drive";
import { AppError } from "@/server/errors";
import { DRIVE_FILE_SCOPE, oauthClient } from "@/server/google";
import { consumeFlowState, issueSession, requireSession } from "@/server/session";

export const runtime = "nodejs";

async function handleLogin(code: string, state: string) {
  await consumeFlowState("login", state);
  const oauth = oauthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw new AppError(401, "GOOGLE_AUTH_FAILED", "Google không trả thông tin tài khoản.");
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: googleConfig().clientId });
  const person = ticket.getPayload();
  if (!person?.sub || !person.email || !person.email_verified || !person.email.toLowerCase().endsWith("@gmail.com")) {
    throw new AppError(403, "GOOGLE_ACCOUNT_UNSUPPORTED", "Bản đầu hỗ trợ Gmail cá nhân đã xác minh.");
  }
  const grantedScopes = new Set(tokens.scope?.split(/\s+/).filter(Boolean));
  if (!grantedScopes.has(DRIVE_FILE_SCOPE) || [...grantedScopes].some(scope =>
    scope.startsWith("https://www.googleapis.com/auth/drive") && scope !== DRIVE_FILE_SCOPE)) {
    throw new AppError(403, "DRIVE_SCOPE_REQUIRED", "Google chưa cấp quyền drive.file.");
  }
  const googleSub = person.sub;
  const email = person.email;
  const displayName = person.name ?? null;
  const refreshToken = tokens.refresh_token;
  const user = await db.$transaction(async tx => {
    const saved = await tx.user.upsert({
      where: { googleSub },
      create: { googleSub, email, displayName },
      update: { email, displayName },
    });
    if (refreshToken) {
      const encrypted = encryptRefreshToken(refreshToken);
      await tx.googleCredential.upsert({
        where: { userId: saved.id },
        create: { userId: saved.id, ...encrypted, scopes: DRIVE_FILE_SCOPE },
        update: { ...encrypted, scopes: DRIVE_FILE_SCOPE, revokedAt: null },
      });
    } else if (!(await tx.googleCredential.findUnique({ where: { userId: saved.id } }))) {
      throw new AppError(401, "GOOGLE_OFFLINE_ACCESS_REQUIRED", "Google chưa cấp quyền truy cập lâu dài. Hãy thử đăng nhập lại.");
    }
    return saved;
  });
  await issueSession(user.id);
}

async function handlePicker(code: string, state: string, pickedIds: string[]) {
  const session = await requireSession();
  await consumeFlowState("picker", state);
  if (pickedIds.length !== 1 || pickedIds[0].includes(",")) {
    throw new AppError(400, "FOLDER_SELECTION_REQUIRED", "Hãy chọn đúng một thư mục.");
  }
  const { tokens } = await oauthClient().getToken(code);
  const grantedScopes = new Set(tokens.scope?.split(/\s+/).filter(Boolean));
  const accessToken = tokens.access_token;
  if (!accessToken || grantedScopes.size !== 1 || !grantedScopes.has(DRIVE_FILE_SCOPE)) {
    throw new AppError(403, "DRIVE_SCOPE_REQUIRED", "Google chưa cấp quyền cho thư mục đã chọn.");
  }
  const about = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
  });
  if (!about.ok) throw new AppError(502, "DRIVE_UNAVAILABLE", "Không xác minh được tài khoản Drive.");
  const identity: { user?: { emailAddress?: string } } = await about.json();
  if (identity.user?.emailAddress?.toLowerCase() !== session.user.email.toLowerCase()) {
    throw new AppError(403, "ACCOUNT_MISMATCH", "Thư mục thuộc tài khoản Google khác phiên đăng nhập.");
  }
  const folder = await verifyOwnedFolder(accessToken, pickedIds[0], session.user.email);
  const existing = session.user.library;
  if (existing && existing.rootDriveId !== folder.id) {
    throw new AppError(409, "ROOT_LOCKED", "Tài khoản này đã gắn với một thư mục Drive; bản đầu chưa hỗ trợ đổi thư mục.");
  }
  if (!existing) {
    await db.$transaction(async tx => {
      const library = await tx.library.create({ data: { userId: session.userId, rootDriveId: folder.id, rootName: folder.name } });
      await tx.auditEvent.create({ data: {
        actorUserId: session.userId, action: "library.select_root", resource: "library",
        resourceId: library.id, after: { rootDriveId: folder.id }, requestId: randomUUID(),
      } });
    });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const picker = Boolean(state && (await cookies()).get("drive_player_picker_state")?.value === state);
  try {
    const code = url.searchParams.get("code");
    if (!state || !code || url.searchParams.has("error")) throw new AppError(400, "GOOGLE_AUTH_FAILED", "Google không hoàn tất xác thực.");
    if (picker) await handlePicker(code, state, url.searchParams.getAll("picked_file_ids"));
    else await handleLogin(code, state);
    return NextResponse.redirect(`${appOrigin()}/?connected=1`);
  } catch (error) {
    process.stderr.write(JSON.stringify({ level: "warn", source: "oauth", kind: error instanceof AppError ? error.code : "GOOGLE_AUTH_FAILED" }) + "\n");
    return NextResponse.redirect(`${appOrigin()}/?authError=1`);
  }
}
