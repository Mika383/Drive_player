import { apiAction, apiData } from "@/server/errors";
import { readSession } from "@/server/session";
import { serviceAccount } from "@/server/config";

export const runtime = "nodejs";

export async function GET() {
  return apiAction(async () => {
    const session = await readSession();
    const library = session?.user.library;
    return apiData({
      signedIn: Boolean(session),
      email: session?.user.email ?? null,
      displayName: session?.user.displayName ?? null,
      serviceAccountEmail: session ? serviceAccount().email : null,
      library: library ? {
        rootName: library.rootName,
        selected: true,
        verified: Boolean(library.verifiedAt),
        ready: Boolean(library.incomingDriveId && library.songsDriveId),
      } : null,
    });
  });
}
