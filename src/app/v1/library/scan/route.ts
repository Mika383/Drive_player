import { apiAction, apiData, AppError } from "@/server/errors";
import { scanLibrary, verifyLibraryFolders } from "@/server/drive";
import { requireSession } from "@/server/session";
import { rateLimit } from "@/server/limit";

export const runtime = "nodejs";

export async function GET() {
  return apiAction(async () => {
    const session = await requireSession();
    rateLimit(`scan:${session.userId}`, 12, 60_000);
    const library = session.user.library;
    if (!library?.verifiedAt || !library.incomingDriveId || !library.songsDriveId) {
      throw new AppError(409, "SETUP_REQUIRED", "Hãy hoàn tất thiết lập thư viện trước.");
    }
    await verifyLibraryFolders(library.rootDriveId, library.incomingDriveId, library.songsDriveId);
    const files = await scanLibrary(library.incomingDriveId, library.songsDriveId);
    return apiData({ files: files.map(({ id, name, mimeType, size, md5Checksum, location, parentDriveId, supported }) => ({
      id, name, mimeType, size: size ? Number(size) : null, md5Checksum: md5Checksum ?? null, location, parentDriveId, supported,
    })) });
  });
}
