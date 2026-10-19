import { cookies } from "next/headers";
import { db } from "./db";
import { AppError } from "./errors";
import { appOrigin } from "./config";
import { hashSession, randomSecret } from "./crypto";

const sessionCookie = "drive_player_session";
const pendingLoginCookie = "drive_player_login_state";
const pendingPickerCookie = "drive_player_picker_state";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof readSession>>>;

function cookieOptions(maxAge?: number) {
  return { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax" as const, path: "/", ...(maxAge === undefined ? {} : { maxAge }) };
}

export async function readSession() {
  const raw = (await cookies()).get(sessionCookie)?.value;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return db.session.findFirst({
    where: { idHash: hashSession(raw), revokedAt: null },
    include: { user: { include: { library: true, credential: true } } },
  });
}

export async function requireSession(): Promise<AuthSession> {
  const session = await readSession();
  if (!session) throw new AppError(401, "AUTH_REQUIRED", "Hãy đăng nhập Google.");
  return session;
}

export async function issueSession(userId: string) {
  const raw = randomSecret();
  await db.session.create({ data: { idHash: hashSession(raw), userId } });
  (await cookies()).set(sessionCookie, raw, cookieOptions(365 * 24 * 60 * 60));
}

export async function revokeSession() {
  const jar = await cookies();
  const raw = jar.get(sessionCookie)?.value;
  if (raw) await db.session.updateMany({ where: { idHash: hashSession(raw) }, data: { revokedAt: new Date() } });
  jar.set(sessionCookie, "", cookieOptions(0));
}

export async function createFlowState(kind: "login" | "picker"): Promise<string> {
  const value = randomSecret();
  (await cookies()).set(kind === "login" ? pendingLoginCookie : pendingPickerCookie, value, cookieOptions(300));
  return value;
}

export async function consumeFlowState(kind: "login" | "picker", state: string | null): Promise<void> {
  const jar = await cookies();
  const name = kind === "login" ? pendingLoginCookie : pendingPickerCookie;
  const stored = jar.get(name)?.value;
  jar.set(name, "", cookieOptions(0));
  if (!state || !stored || state !== stored) {
    throw new AppError(403, "INVALID_STATE", "Phiên Google không hợp lệ hoặc đã hết hạn.");
  }
}
