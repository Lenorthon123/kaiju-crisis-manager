import {
  departingTransfers,
  expiredReservations,
  isReservationExpired,
  shouldDepart,
  type DepartableTransfer,
  type ExpirableReservation,
} from '../reconciliation';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const at = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000);

const reservation = (over: Partial<ExpirableReservation> = {}): ExpirableReservation => ({
  id: 'r1',
  status: 'ACTIVE',
  endAt: at(-1),
  quantity: 3,
  ...over,
});

const transfer = (over: Partial<DepartableTransfer> = {}): DepartableTransfer => ({
  id: 't1',
  status: 'APPROVED',
  departureAt: at(-1),
  ...over,
});

describe('reservation expiry', () => {
  it('expires a reservation whose window has closed', () => {
    expect(isReservationExpired(reservation({ endAt: at(-1) }), NOW)).toBe(true);
  });

  it('keeps a reservation whose window is still open', () => {
    expect(isReservationExpired(reservation({ endAt: at(1) }), NOW)).toBe(false);
  });

  it('treats the boundary as closed', () => {
    expect(isReservationExpired(reservation({ endAt: NOW }), NOW)).toBe(true);
  });

  it('never re-expires a reservation that was already given back', () => {
    for (const status of ['RELEASED', 'CANCELLED'] as const) {
      expect(isReservationExpired(reservation({ status, endAt: at(-100) }), NOW)).toBe(false);
    }
  });

  it('selects only the expired ones, whatever the input order', () => {
    const rows = [
      reservation({ id: 'past', endAt: at(-60) }),
      reservation({ id: 'future', endAt: at(60) }),
      reservation({ id: 'released', status: 'RELEASED', endAt: at(-60) }),
      reservation({ id: 'boundary', endAt: NOW }),
    ];
    const pick = (list: ExpirableReservation[]) =>
      expiredReservations(list, NOW)
        .map((r) => r.id)
        .sort();

    expect(pick(rows)).toEqual(['boundary', 'past']);
    expect(pick([...rows].reverse())).toEqual(['boundary', 'past']);
  });
});

describe('transfer departure', () => {
  it('sends an approved transfer on its way once departure time has come', () => {
    expect(shouldDepart(transfer({ departureAt: at(-1) }), NOW)).toBe(true);
    expect(shouldDepart(transfer({ departureAt: NOW }), NOW)).toBe(true);
  });

  it('waits until the departure time', () => {
    expect(shouldDepart(transfer({ departureAt: at(30) }), NOW)).toBe(false);
  });

  it('never departs a transfer that is not approved', () => {
    for (const status of [
      'PENDING_SOURCE_APPROVAL',
      'PENDING_TRANSIT_APPROVAL',
      'IN_TRANSIT',
      'DELIVERED',
      'REJECTED',
      'CANCELLED',
    ] as const) {
      expect(shouldDepart(transfer({ status, departureAt: at(-100) }), NOW)).toBe(false);
    }
  });

  it('never departs a transfer with no departure time', () => {
    expect(shouldDepart(transfer({ departureAt: null }), NOW)).toBe(false);
  });

  it('selects only the departing ones', () => {
    const rows = [
      transfer({ id: 'go', departureAt: at(-5) }),
      transfer({ id: 'wait', departureAt: at(5) }),
      transfer({ id: 'unapproved', status: 'PENDING_SOURCE_APPROVAL', departureAt: at(-5) }),
      transfer({ id: 'no-date', departureAt: null }),
    ];
    expect(departingTransfers(rows, NOW).map((t) => t.id)).toEqual(['go']);
  });
});
