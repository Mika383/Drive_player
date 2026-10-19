import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ErrorCode =
  | "ACCOUNT_MISMATCH" | "AUTH_REQUIRED" | "DRIVE_SCOPE_REQUIRED" | "DRIVE_UNAVAILABLE"
  | "DUPLICATE_FOLDER" | "FOLDER_MOVED" | "FOLDER_SELECTION_REQUIRED"
  | "GOOGLE_ACCOUNT_UNSUPPORTED" | "GOOGLE_AUTH_FAILED" | "GOOGLE_OFFLINE_ACCESS_REQUIRED"
  | "GOOGLE_REAUTH_REQUIRED" | "INTERNAL_ERROR" | "INVALID_RANGE" | "INVALID_STATE"
  | "PERMISSION_DENIED" | "RATE_LIMITED" | "ROOT_LOCKED" | "SETUP_REQUIRED"
  | "VALIDATION_ERROR";

export class AppError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
  }
}

export function apiData<T>(data: T, message = "OK", status = 200) {
  return NextResponse.json({ status, data, message, error: null }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function apiAction(action: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  try {
    return await action(requestId);
  } catch (error) {
    const known = error instanceof AppError ? error : null;
    const status = known?.status ?? 500;
    if (!known) {
      // Never include request bodies, OAuth codes, file IDs, tokens or provider responses.
      process.stderr.write(JSON.stringify({ level: "error", source: "api", requestId, kind: error instanceof Error ? error.name : "Unknown" }) + "\n");
    }
    return NextResponse.json({
      status,
      data: null,
      message: known?.message ?? "Lỗi máy chủ. Vui lòng thử lại.",
      error: { code: known?.code ?? "INTERNAL_ERROR", details: null, fieldErrors: null },
    }, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new AppError(403, "PERMISSION_DENIED", "Nguồn yêu cầu không hợp lệ.");
}
