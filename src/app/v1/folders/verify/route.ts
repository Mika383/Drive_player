import { db } from "@/server/db";
import { verifyBotEditor } from "@/server/drive";
import { apiAction, apiData, AppError, requireSameOrigin } from "@/server/errors";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiAction(async requestId => {
    requireSameOrigin(request);
    const session = await requireSession();
    const library = session.user.library;
    if (!library) throw new AppError(409, "SETUP_REQUIRED", "Hãy chọn thư mục Drive trước.");
    await verifyBotEditor(library.rootDriveId);
    if (!library.verifiedAt) {
      await db.$transaction(async tx => {
        await tx.library.update({ where: { id: library.id }, data: { verifiedAt: new Date(), revision: { increment: 1 } } });
        await tx.auditEvent.create({ data: {
          actorUserId: session.userId, action: "library.verify_editor", resource: "library",
          resourceId: library.id, after: { verified: true }, requestId,
        } });
      });
    }
    return apiData({ verified: true });
  });
}
