import { authorizedAudio, streamFromDrive } from "@/server/drive";
import { apiAction, AppError } from "@/server/errors";
import { rateLimit } from "@/server/limit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  return apiAction(async () => {
    const startedAt = performance.now();
    const session = await requireSession();
    const sessionAt = performance.now();
    rateLimit(`audio:${session.userId}`, 240, 60_000);
    const { fileId } = await context.params;
    const query = new URL(request.url).searchParams;
    const file = await authorizedAudio(session, fileId, query.get("parent") ?? undefined);
    const revision = query.get("revision");
    if (revision && (!/^[a-fA-F0-9]{32}$/.test(revision) || file.md5Checksum !== revision)) {
      throw new AppError(409, "INVALID_STATE", "Tệp đã thay đổi. Hãy quét lại thư mục.");
    }
    const authorizedAt = performance.now();
    const response = await streamFromDrive(fileId, request.headers.get("range"), request.signal);
    const upstreamAt = performance.now();
    response.headers.set("Server-Timing", [
      `session;dur=${(sessionAt - startedAt).toFixed(1)}`,
      `authorize;dur=${(authorizedAt - sessionAt).toFixed(1)}`,
      `drive;dur=${(upstreamAt - authorizedAt).toFixed(1)}`,
    ].join(", "));
    return response;
  });
}
