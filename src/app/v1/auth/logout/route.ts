import { apiAction, apiData, requireSameOrigin } from "@/server/errors";
import { revokeSession } from "@/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return apiAction(async () => {
    requireSameOrigin(request);
    await revokeSession();
    return apiData({ signedIn: false });
  });
}
