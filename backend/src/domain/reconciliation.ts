export type ReservationStatusLike = 'ACTIVE' | 'RELEASED' | 'CANCELLED';

export interface ExpirableReservation {
  id: string;
  status: ReservationStatusLike;
  endAt: Date;
  quantity: number;
}

export type TransferStatusLike =
  | 'PENDING_SOURCE_APPROVAL'
  | 'PENDING_TRANSIT_APPROVAL'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export interface DepartableTransfer {
  id: string;
  status: TransferStatusLike;
  departureAt: Date | null;
}

// Inclusive boundary: at exactly endAt the window is over. One more
// millisecond would be arbitrary, and a test can pin this down.
export function isReservationExpired(
  reservation: ExpirableReservation,
  now: Date,
): boolean {
  if (reservation.status !== 'ACTIVE') return false;
  return reservation.endAt.getTime() <= now.getTime();
}

export function expiredReservations<T extends ExpirableReservation>(
  reservations: readonly T[],
  now: Date,
): T[] {
  return reservations.filter((r) => isReservationExpired(r, now));
}

// No departure time means it was never approved, so it never leaves.
export function shouldDepart(transfer: DepartableTransfer, now: Date): boolean {
  if (transfer.status !== 'APPROVED') return false;
  if (transfer.departureAt === null) return false;
  return transfer.departureAt.getTime() <= now.getTime();
}

export function departingTransfers<T extends DepartableTransfer>(
  transfers: readonly T[],
  now: Date,
): T[] {
  return transfers.filter((t) => shouldDepart(t, now));
}
