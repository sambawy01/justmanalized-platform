import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedAdminRequest,
  unauthorizedResponse,
} from "@/lib/admin/auth";
import { getPrivateBlob } from "@/lib/blob-read";

export const runtime = "nodejs";

/**
 * GET /api/admin/media/file?p=<pathname> — stream a PRIVATE blob (uploaded
 * product / store-sale photos) to the authenticated admin. The Blob store is
 * private-only, so public URLs aren't possible; these images are only ever
 * shown inside /admin and the POS, which are auth-gated (Basic or ?key=).
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) return unauthorizedResponse();

  const p = new URL(request.url).searchParams.get("p") || "";
  // Safe pathname: our own prefixes only, no traversal.
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/.test(p) || p.includes("..")) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof getPrivateBlob>>;
  try {
    result = await getPrivateBlob(p);
  } catch (error) {
    console.error("[admin/media/file] read failed:", error);
    return NextResponse.json({ error: "Read failed" }, { status: 502 });
  }
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ext = (p.split(".").pop() || "").toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "image/jpeg";
  return new Response(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
