import { db } from "@/server/db";
import { ensureFolders } from "@/server/drive";
import { apiAction, apiData, AppError, requireSameOrigin } from "@/server/errors";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiAction(async requestId => {
    requireSameOrigin(request);
    const session = await requireSession();
    const library = session.user.library;
    if (!library) throw new AppError(409, "SETUP_REQUIRED", "Hãy chọn thư mục Drive trước.");
    const folders = await ensureFolders(session);
    if (library.incomingDriveId !== folders.incoming || library.songsDriveId !== folders.songs) {
      await db.$transaction(async tx => {
        await tx.library.update({ where: { id: library.id }, data: {
          incomingDriveId: folders.incoming, songsDriveId: folders.songs, revision: { increment: 1 },
        } });
        await tx.auditEvent.create({ data: {
          actorUserId: session.userId, action: "library.setup_folders", resource: "library",
          resourceId: library.id, after: { incomingDriveId: folders.incoming, songsDriveId: folders.songs }, requestId,
        } });
      });
    }
    return apiData({ ready: true });
  });
}
