/**
 * INERT BOOKING STUB — Just Manalized is a pure e-commerce (hats) store with no
 * appointment booking. The original studio site integrated Cal.com here; that
 * integration was removed wholesale.
 *
 * This module survives only to keep the BOOKING TYPES and EMPTY data sources
 * that a handful of internal subsystems (CRM, finance report, weekly/evening
 * reports, daily brief) still reference structurally. Every "list" returns an
 * empty set, so those subsystems compute cleanly on ORDERS ONLY. Every booking
 * MUTATION throws — nothing in the app should call them, and if something ever
 * does, it must fail loudly rather than silently pretend to book.
 *
 * Do NOT reintroduce Cal.com here. If appointments are ever wanted, build a
 * fresh, intentional integration.
 */

export interface CalAttendee {
  name: string;
  email: string;
  timeZone: string;
}

export interface CalBooking {
  id: number;
  uid: string;
  title: string;
  description?: string;
  status: "pending" | "accepted" | "cancelled" | "rejected" | string;
  start: string;
  end: string;
  duration: number;
  eventTypeId: number;
  eventType?: { id: number; slug: string };
  attendees: CalAttendee[];
  bookingFieldsResponses?: Record<string, unknown>;
}

export interface ListBookingsInRangeOptions {
  status?: string;
  take?: number;
}

export interface CalActionResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface CalOutOfOffice {
  id: number;
  uuid?: string;
  start: string;
  end: string;
  notes?: string | null;
  reason?: string | null;
}

const DISABLED = "Booking is disabled — Just Manalized is an e-commerce store with no appointments.";

/** No appointments — always empty. */
export async function listOwnerBookings(): Promise<CalBooking[]> {
  return [];
}

/** No appointments — always empty for any range. */
export async function listBookingsInRange(
  _fromIso: string,
  _toIso: string,
  _options: ListBookingsInRangeOptions = {}
): Promise<CalBooking[]> {
  void _fromIso;
  void _toIso;
  void _options;
  return [];
}

/** No calendar to block — always empty. */
export async function listOutOfOffice(): Promise<CalOutOfOffice[]> {
  return [];
}

export function confirmBooking(_uid: string): Promise<CalActionResult> {
  throw new Error(DISABLED);
}

export function declineBooking(_uid: string, _reason: string): Promise<CalActionResult> {
  throw new Error(DISABLED);
}

export function rescheduleBooking(
  _uid: string,
  _startIsoUtc: string,
  _reschedulingReason?: string
): Promise<CalActionResult> {
  throw new Error(DISABLED);
}

export function createOutOfOffice(
  _startDate: string,
  _endDate: string,
  _notes?: string
): Promise<CalOutOfOffice> {
  throw new Error(DISABLED);
}

export function deleteOutOfOffice(_id: number): Promise<CalActionResult> {
  throw new Error(DISABLED);
}
