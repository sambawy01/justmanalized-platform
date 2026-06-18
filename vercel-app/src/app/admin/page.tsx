import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { isValidAdminKey, isValidBasicAuth } from "@/lib/admin/auth";
import { listOrders, type StoredOrder } from "@/lib/orders";
import { getCatalog, type Product } from "@/lib/catalog";
import { buildPnL, resolvePeriod, type PnL } from "@/lib/finance-report";
import {
  getClientsOverview,
  toClientSummary,
  type ClientSummary,
  type RebookingClient,
  type UnlinkedOverlay,
} from "@/lib/crm";
import AdminTabs from "./admin-tabs";
import OrdersSection from "./orders-section";
import ProductsSection from "./products-section";
import FinanceSection from "./finance-section";
import ClientsSection from "./clients-section";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Just Manalized",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Auth happens in the proxy (which answers 401 + WWW-Authenticate so the
  // browser shows its native Basic login prompt). This re-check is defense
  // in depth: Basic credentials OR the legacy ?key= link from old emails.
  const { key } = await searchParams;
  const legacyKey =
    typeof key === "string" && isValidAdminKey(key) ? key : "";
  const requestHeaders = await headers();
  const basicOk = isValidBasicAuth(requestHeaders.get("authorization"));
  if (!basicOk && !legacyKey) notFound();

  // When authenticated via Basic, the browser re-attaches the Authorization
  // header to every same-origin fetch, so client components can send an
  // empty x-admin-key — the API routes accept either credential.
  const clientKey = legacyKey;

  let orders: StoredOrder[] = [];
  let ordersError: string | null = null;
  let products: Product[] = [];
  let productsError: string | null = null;
  let financePnl: PnL | null = null;
  let financeError: string | null = null;
  let clientSummaries: ClientSummary[] = [];
  let rebooking: RebookingClient[] = [];
  let unlinkedOverlays: UnlinkedOverlay[] = [];
  let clientsError: string | null = null;
  const monthPeriod = resolvePeriod({ period: "month" });
  // Shop orders, the product catalog, the finance P&L and the client directory
  // load independently — one backend being down must not blank the others.
  const [ordersResult, catalogResult, financeResult, clientsResult] =
    await Promise.allSettled([
      listOrders({ limit: 100 }),
      getCatalog(),
      monthPeriod.ok ? buildPnL(monthPeriod.period) : Promise.reject(new Error("bad period")),
      getClientsOverview({ weeks: 6 }),
    ]);
  if (ordersResult.status === "fulfilled") {
    orders = ordersResult.value;
  } else {
    console.error("Admin orders load error:", ordersResult.reason);
    ordersError = "Couldn't load shop orders. Pull down to refresh or try again shortly.";
  }
  if (catalogResult.status === "fulfilled") {
    products = catalogResult.value;
  } else {
    console.error("Admin catalog load error:", catalogResult.reason);
    productsError = "Couldn't load the product catalog. Pull down to refresh or try again shortly.";
  }
  if (financeResult.status === "fulfilled") {
    financePnl = financeResult.value;
  } else {
    console.error("Admin finance load error:", financeResult.reason);
    financeError = "Couldn't load the finance ledger. Pull down to refresh or try again shortly.";
  }
  if (clientsResult.status === "fulfilled") {
    clientSummaries = clientsResult.value.profiles.map(toClientSummary);
    rebooking = clientsResult.value.rebooking;
    unlinkedOverlays = clientsResult.value.unlinked;
  } else {
    console.error("Admin clients load error:", clientsResult.reason);
    clientsError = "Couldn't load clients. Pull down to refresh or try again shortly.";
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png?v=3" alt="Just Manalized" className="mb-3 h-16 w-auto" />
        <h1 className="mt-2 font-serif text-4xl text-[#38492E]">Store admin</h1>
        <p className="mt-2 text-sm text-[#5E6B4F]">
          Times shown in Cairo time (Africa/Cairo).
        </p>
      </header>

      <AdminTabs
        rebookingDue={rebooking.length}
        orders={
          <OrdersSection
            orders={orders}
            adminKey={clientKey}
            loadError={ordersError}
          />
        }
        products={
          <ProductsSection
            initialProducts={products}
            adminKey={clientKey}
            loadError={productsError}
          />
        }
        finance={
          <FinanceSection
            initialPnl={financePnl}
            adminKey={clientKey}
            loadError={financeError}
          />
        }
        clients={
          <ClientsSection
            initialClients={clientSummaries}
            initialRebooking={rebooking}
            initialUnlinked={unlinkedOverlays}
            adminKey={clientKey}
            loadError={clientsError}
          />
        }
      />
    </main>
  );
}
