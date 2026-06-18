import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isValidAdminKey, isValidBasicAuth } from "@/lib/admin/auth";
import { getCatalog, type Product } from "@/lib/catalog";
import PosClient from "./pos-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store POS — Just Manalized",
  robots: { index: false, follow: false },
};

/**
 * /admin/pos — a simple in-store point-of-sale for the El Gouna shop.
 * Same auth as /admin (Basic or legacy ?key=, re-checked here + in the proxy).
 */
export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { key } = await searchParams;
  const legacyKey = typeof key === "string" && isValidAdminKey(key) ? key : "";
  const requestHeaders = await headers();
  const basicOk = isValidBasicAuth(requestHeaders.get("authorization"));
  if (!basicOk && !legacyKey) notFound();

  let products: Product[] = [];
  try {
    products = (await getCatalog()).filter((p) => p.active);
  } catch {
    products = [];
  }

  return <PosClient products={products} adminKey={legacyKey} />;
}
