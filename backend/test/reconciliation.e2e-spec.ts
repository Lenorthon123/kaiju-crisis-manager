import {
  TestContext,
  createTestApp,
  readStock,
  resetDatabase,
  setCatastropheLevel,
} from './helpers/app';
import { asQC, asCD } from './helpers/client';
import { ReconciliationService } from '../src/scheduler/reconciliation.service';

// The cron is off under test; the suite calls reconcile(now) with an explicit
// timestamp. A two-hour window is tested in a millisecond, and nothing fires
// between two assertions.
describe('reconciliation', () => {
  let ctx: TestContext;
  let reconciler: ReconciliationService;

  beforeAll(async () => {
    ctx = await createTestApp();
    reconciler = ctx.app.get(ReconciliationService);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
  });

  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

  describe('expired reservations', () => {
    it('gives the units back once the window has closed', async () => {
      await setCatastropheLevel(ctx, 2);
      const apex = await asQC(ctx, 'A');

      await apex
        .post('/reservations', {
          districtCode: 'A',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 5,
          startAt: hours(1).toISOString(),
          endAt: hours(3).toISOString(),
        })
        .expect(201);

      expect((await readStock(ctx, 'A', 'MEDICAL_PERSONNEL')).reservedQuantity).toBe(5);

      expect(await reconciler.reconcile(hours(2))).toMatchObject({ released: 0 });
      expect((await readStock(ctx, 'A', 'MEDICAL_PERSONNEL')).reservedQuantity).toBe(5);

      expect(await reconciler.reconcile(hours(4))).toMatchObject({ released: 1 });
      expect((await readStock(ctx, 'A', 'MEDICAL_PERSONNEL')).reservedQuantity).toBe(0);

      const reservations = await apex.get('/reservations?district=A').expect(200);
      expect(reservations.body[0].status).toBe('RELEASED');
    });

    it('is idempotent — a second pass releases nothing more', async () => {
      await setCatastropheLevel(ctx, 2);
      const apex = await asQC(ctx, 'A');
      await apex
        .post('/reservations', {
          districtCode: 'A',
          resourceCode: 'RESCUE_TEAMS',
          quantity: 2,
          startAt: hours(1).toISOString(),
          endAt: hours(2).toISOString(),
        })
        .expect(201);

      expect(await reconciler.reconcile(hours(3))).toMatchObject({ released: 1 });
      expect(await reconciler.reconcile(hours(3))).toMatchObject({ released: 0 });
      expect((await readStock(ctx, 'A', 'RESCUE_TEAMS')).reservedQuantity).toBe(0);
    });

    it('does not double-release one an officer already gave back', async () => {
      await setCatastropheLevel(ctx, 2);
      const apex = await asQC(ctx, 'A');
      const created = await apex
        .post('/reservations', {
          districtCode: 'A',
          resourceCode: 'RESCUE_TEAMS',
          quantity: 2,
          startAt: hours(1).toISOString(),
          endAt: hours(2).toISOString(),
        })
        .expect(201);

      await apex.del(`/reservations/${created.body.id}`).expect(200);
      expect((await readStock(ctx, 'A', 'RESCUE_TEAMS')).reservedQuantity).toBe(0);

      expect(await reconciler.reconcile(hours(3))).toMatchObject({ released: 0 });
      expect((await readStock(ctx, 'A', 'RESCUE_TEAMS')).reservedQuantity).toBe(0);
    });
  });

  describe('transfer departure', () => {
    it('puts an approved transfer on the road at its departure time', async () => {
      await setCatastropheLevel(ctx, 3);
      const xeno = await asQC(ctx, 'X');
      const apex = await asQC(ctx, 'A');

      const created = await xeno
        .post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 3,
        })
        .expect(201);

      expect(await reconciler.reconcile(hours(48))).toMatchObject({ departed: 0 });

      const approved = await apex.post(`/transfers/${created.body.id}/approve`).expect(201);
      expect(approved.body.status).toBe('APPROVED');

      expect(await reconciler.reconcile(hours(1))).toMatchObject({ departed: 1 });

      const after = await xeno.get('/transfers?district=X').expect(200);
      const transfer = after.body.find((t: { id: string }) => t.id === created.body.id);
      expect(transfer.status).toBe('IN_TRANSIT');
      expect(transfer.legs.every((l: { status: string }) => l.status === 'IN_TRANSIT')).toBe(true);

      expect(await reconciler.reconcile(hours(2))).toMatchObject({ departed: 0 });
      await xeno.post(`/transfers/${created.body.id}/deliver`).expect(201);

      const source = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
      expect(source).toMatchObject({ currentQuantity: 9, committedOutbound: 0 });
    });

    it('leaves a rejected transfer alone', async () => {
      await setCatastropheLevel(ctx, 3);
      const xeno = await asQC(ctx, 'X');
      const apex = await asQC(ctx, 'A');
      const cd = await asCD(ctx);

      const created = await xeno
        .post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 2,
        })
        .expect(201);
      await apex.post(`/transfers/${created.body.id}/reject`, { reason: 'Needed locally' }).expect(201);

      expect(await reconciler.reconcile(hours(48))).toMatchObject({ departed: 0 });

      const all = await cd.get('/transfers').expect(200);
      const transfer = all.body.find((t: { id: string }) => t.id === created.body.id);
      expect(transfer.status).toBe('REJECTED');
    });
  });
});
