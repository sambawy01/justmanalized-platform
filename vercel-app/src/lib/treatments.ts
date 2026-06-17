/**
 * INERT TREATMENTS STUB — Just Manalized sells hats, not treatments. The
 * original studio site had a Cal.com-linked treatments catalog; it was removed.
 *
 * This survives only to keep the `Treatment` type and an EMPTY catalog source
 * that the finance report and CRM still reference structurally. The catalog is
 * always empty, so treatment revenue is always zero and clients derive from
 * shop orders only. Do NOT reintroduce a treatments catalog here — the shop
 * product catalog lives in @/lib/catalog.
 */

export interface Treatment {
  slug: string;
  /** Legacy Cal.com event-type link — always 0 now (no bookings). */
  eventTypeId: number;
  name: { en: string; ru: string };
  description: { en: string; ru: string };
  durationMinutes: number;
  priceEgp: number;
  priceRub: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** No treatments — always empty. */
export async function getTreatmentsCatalog(): Promise<Treatment[]> {
  return [];
}
