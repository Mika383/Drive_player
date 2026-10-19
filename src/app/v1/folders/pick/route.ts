import { NextResponse } from "next/server";
import { pickerUrl } from "@/server/google";
import { createFlowState, requireSession } from "@/server/session";
import { apiAction } from "@/server/errors";
import { appOrigin } from "@/server/config";

export const runtime = "nodejs";

export async function GET() {
  return apiAction(async () => {
    const session = await requireSession();
    if (session.user.library) return NextResponse.redirect(`${appOrigin()}/?folderLocked=1`);
    return NextResponse.redirect(pickerUrl(await createFlowState("picker"), session.user.email));
  });
}
