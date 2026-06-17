import { get, head, BlobNotFoundError } from "@vercel/blob";

/**
 * v2-token-safe private blob read.
 *
 * The store-bound `get(pathname, { access: "private" })` form requires the SDK
 * to extract a store ID from the token — which only works for the LEGACY
 * `vercel_blob_rw_<storeId>_…` token format. Vercel now issues v2 tokens
 * (`eyJ…`), from which the classic parser can't extract a store ID, so the
 * pathname form throws "Invalid token: unable to extract store ID" before any
 * network call.
 *
 * `head(pathname)` resolves the blob's full URL via the API (token sent as a
 * bearer, store resolved server-side — works with v2 tokens), and `get(url)`
 * skips store-ID extraction entirely. So head → get(url) is the v2-safe read.
 *
 * Returns the same shape `get` returns (with `.stream`), or null when the blob
 * is missing — matching the previous `get(pathname, …)` contract so call sites
 * keep their `if (!result) …` / `new Response(result.stream)` handling.
 */
export async function getPrivateBlob(
  pathname: string
): Promise<Awaited<ReturnType<typeof get>>> {
  let url: string;
  try {
    const meta = await head(pathname);
    url = meta.url;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  return get(url, { access: "private", useCache: false });
}
