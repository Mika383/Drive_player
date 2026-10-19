import { NextResponse } from "next/server";
import { loginUrl } from "@/server/google";
import { createFlowState } from "@/server/session";
import { rateLimit } from "@/server/limit";
import { apiAction } from "@/server/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return apiAction(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateLimit(`login:${ip}`, 10, 60_000);
    return NextResponse.redirect(loginUrl(await createFlowState("login")));
  });
}
