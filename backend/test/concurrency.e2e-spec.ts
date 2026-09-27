import {
  TestContext,
  createTestApp,
  readStock,
  resetDatabase,
  setCatastropheLevel,
  setStock,
} from './helpers/app';
import { Officer, asQC, expectViolation } from './helpers/client';

// These fail loudly if anyone ever removes the row lock.
describe('concurrency on a scarce resource', () => {
  let ctx: TestContext;
  let xeno: Officer;
  let echo: Officer;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    await setCatastropheLevel(ctx, 3); // adjacent transfers authorised
    xeno = await asQC(ctx, 'X');
    echo = await asQC(ctx, 'E');
  });

  it('lets exactly one of two simultaneous requests take the last transferable unit', async () => {
    await setStock(ctx, 'A', 'MEDICAL_PERSONNEL', { current: 5 });

    const body = {
      sourceDistrict: 'A',
      destinationDistrict: 'X',
      resourceCode: 'MEDICAL_PERSONNEL',
      quantity: 1,
    };
    const otherBody = { ...body, destinationDistrict: 'E' };

    const [first, second] = await Promise.all([
      xeno.post('/transfers', body),
      echo.post('/transfers', otherBody),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 422]);

    const loser = first.status === 422 ? first : second;
    expect(['RETENTION_THRESHOLD_BREACH', 'INSUFFICIENT_STOCK']).toContain(loser.body.code);

    const stock = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
    expect(stock.committedOutbound).toBe(1);
  });

  it('never lets a burst of requests push a quarter below its retention floor', async () => {
    await setStock(ctx, 'A', 'MEDICAL_PERSONNEL', { current: 12 });

    const attempts = Array.from({ length: 12 }, () =>
      xeno.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
      }),
    );
    const results = await Promise.all(attempts);

    const accepted = results.filter((res) => res.status === 201).length;
    expect(accepted).toBe(8);

    const stock = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
    expect(stock.committedOutbound).toBe(8);
    expect(stock.currentQuantity - stock.committedOutbound).toBe(4);

    for (const rejected of results.filter((res) => res.status !== 201)) {
      expectViolation(rejected, 'RETENTION_THRESHOLD_BREACH', 422);
    }
  });

  it('does not let stacked reservations be double-spent by a transfer', async () => {
    await setCatastropheLevel(ctx, 3);
    await setStock(ctx, 'A', 'MEDICAL_PERSONNEL', { current: 12 });
    const apex = await asQC(ctx, 'A');

    await apex
      .post('/reservations', {
        districtCode: 'A',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 8,
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .expect(201);

    const transfer = await xeno.post('/transfers', {
      sourceDistrict: 'A',
      destinationDistrict: 'X',
      resourceCode: 'MEDICAL_PERSONNEL',
      quantity: 1,
    });

    expectViolation(transfer, 'RETENTION_THRESHOLD_BREACH', 422);
  });
});
