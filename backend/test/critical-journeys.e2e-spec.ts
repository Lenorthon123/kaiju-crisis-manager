import {
  TestContext,
  createTestApp,
  readStock,
  resetDatabase,
  setCatastropheLevel,
  setStock,
} from './helpers/app';
import { Officer, asCD, asLC, asQC, expectViolation, login } from './helpers/client';
import { TEST_PASSWORD } from './helpers/app';
import request from 'supertest';

describe('critical user journeys', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
  });

  describe('1. authentication and role scoping', () => {
    it('rejects an unauthenticated call', async () => {
      await request(ctx.app.getHttpServer()).get('/api/districts').expect(401);
    });

    it('logs each role in and returns its scope', async () => {
      const qc = await asQC(ctx, 'A');
      expect(qc.profile).toMatchObject({ role: 'QC', districtCode: 'A' });

      const lc = await asLC(ctx);
      expect(lc.profile).toMatchObject({ role: 'LC', districtCode: null });

      const cd = await asCD(ctx);
      expect(cd.profile).toMatchObject({ role: 'CD', districtCode: null });
    });

    it('answers identically to an unknown account and a wrong password', async () => {
      const unknown = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ghost@test.local', password: TEST_PASSWORD });
      const wrong = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lc@test.local', password: 'wrong-password-here' });

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.code).toBe(wrong.body.code);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('refuses to create a Quarter Coordinator with no quarter', async () => {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'orphan@test.local',
          password: TEST_PASSWORD,
          displayName: 'Orphan',
          role: 'QC',
        });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('QC_REQUIRES_DISTRICT');
    });
  });

  describe('2. reservation inside its own quarter', () => {
    const window = () => ({
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      endAt: new Date(Date.now() + 7_200_000).toISOString(),
    });

    it('is impossible at level 1 (Watch)', async () => {
      const apex = await asQC(ctx, 'A');
      const response = await apex.post('/reservations', {
        districtCode: 'A',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 2,
        ...window(),
      });
      expectViolation(response, 'ROLE_NOT_PERMITTED_AT_LEVEL', 403);
    });

    it('succeeds at level 2 and holds the units', async () => {
      await setCatastropheLevel(ctx, 2);
      const apex = await asQC(ctx, 'A');

      await apex
        .post('/reservations', {
          districtCode: 'A',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 3,
          ...window(),
        })
        .expect(201);

      const stock = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
      expect(stock.reservedQuantity).toBe(3);
    });

    it('cannot reach into another quarter', async () => {
      await setCatastropheLevel(ctx, 2);
      const apex = await asQC(ctx, 'A');

      const response = await apex.post('/reservations', {
        districtCode: 'E',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
        ...window(),
      });
      expectViolation(response, 'OUT_OF_SCOPE_QUARTER', 403);
    });

    it('is refused to the City Director, per the matrix', async () => {
      await setCatastropheLevel(ctx, 5);
      const cd = await asCD(ctx);

      const response = await cd.post('/reservations', {
        districtCode: 'A',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
        ...window(),
      });
      expectViolation(response, 'ROLE_NOT_PERMITTED_AT_LEVEL', 403);
    });
  });

  describe('3. inter-quarter transfer gated by the catastrophe level', () => {
    it('is forbidden at level 2', async () => {
      await setCatastropheLevel(ctx, 2);
      const xeno = await asQC(ctx, 'X');

      const response = await xeno.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
      });
      expectViolation(response, 'INTER_QUARTER_TRANSFER_FORBIDDEN', 403);
    });

    it('is authorised between adjacent quarters at level 3', async () => {
      await setCatastropheLevel(ctx, 3);
      const xeno = await asQC(ctx, 'X');

      const response = await xeno.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 2,
      });
      expect(response.status).toBe(201);
      expect(response.body.mode).toBe('DIRECT');
      expect(response.body.status).toBe('PENDING_SOURCE_APPROVAL');
    });

    it('refuses a transit chain at level 3', async () => {
      await setCatastropheLevel(ctx, 3);
      const zion = await asQC(ctx, 'Z');

      const response = await zion.post('/transfers', {
        sourceDistrict: 'E',
        destinationDistrict: 'Z',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 1,
      });
      expectViolation(response, 'TRANSIT_FORBIDDEN_AT_LEVEL', 403);
    });

    it('unlocks the transit chain for the Logistics Coordinator at level 4', async () => {
      await setCatastropheLevel(ctx, 4);
      await setStock(ctx, 'W', 'RESCUE_TEAMS', { current: 1 });
      await setStock(ctx, 'X', 'RESCUE_TEAMS', { current: 2 });
      const lc = await asLC(ctx);

      const response = await lc.post('/transfers', {
        sourceDistrict: 'E',
        destinationDistrict: 'Z',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 3,
      });
      expect(response.status).toBe(201);
      expect(response.body.mode).toBe('TRANSIT');
      expect(response.body.legs).toHaveLength(2);
      expect(response.body.legs[1].fromNode).toBe('X');
      expect(response.body.legs[1].approvalRequired).toBe(true);
    });

    it('still refuses a transit chain to a Quarter Coordinator at level 4', async () => {
      await setCatastropheLevel(ctx, 4);
      const zion = await asQC(ctx, 'Z');

      const response = await zion.post('/transfers', {
        sourceDistrict: 'E',
        destinationDistrict: 'Z',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 1,
      });
      expectViolation(response, 'ROLE_NOT_PERMITTED_AT_LEVEL', 403);
    });
  });

  describe('4. topology refusals', () => {
    beforeEach(() => setCatastropheLevel(ctx, 5));

    it('refuses a direct transfer between non-adjacent quarters', async () => {
      const cd = await asCD(ctx);
      const response = await cd.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'Z',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
        mode: 'DIRECT',
      });
      expectViolation(response, 'NOT_ADJACENT', 422);
    });

    it('refuses a maritime route out of a landlocked quarter', async () => {
      const cd = await asCD(ctx);
      const response = await cd.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'Z',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 1,
        mode: 'MARITIME',
      });
      expectViolation(response, 'MARITIME_ROUTE_UNAVAILABLE', 422);
    });

    it('prioritises the maritime route at level 5 between Echo and Zion', async () => {
      await setStock(ctx, 'W', 'RESCUE_TEAMS', { current: 1 });
      await setStock(ctx, 'X', 'RESCUE_TEAMS', { current: 2 });
      const cd = await asCD(ctx);

      const response = await cd.post('/transfers', {
        sourceDistrict: 'E',
        destinationDistrict: 'Z',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 3,
      });
      expect(response.status).toBe(201);
      expect(response.body.mode).toBe('MARITIME');
    });

    it('lists every legal route between two quarters', async () => {
      const lc = await asLC(ctx);
      const response = await lc.get('/districts/routes?from=A&to=Z').expect(200);

      expect(response.body.adjacent).toBe(false);
      const intermediates = response.body.routes
        .map((r: { transitDistricts: string[] }) => r.transitDistricts.join())
        .sort();
      expect(intermediates).toEqual(['W', 'X']);
    });
  });

  describe('5. retention threshold', () => {
    beforeEach(() => setCatastropheLevel(ctx, 3));

    it('refuses the transfer that would breach the floor, and says by how much', async () => {
      const xeno = await asQC(ctx, 'X');
      const response = await xeno.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 9, // Apex holds 12, must keep 4
      });

      expectViolation(response, 'RETENTION_THRESHOLD_BREACH', 422);
      expect(response.body.details).toMatchObject({
        minimum: 4,
        maxTransferable: 8,
        retentionBase: 12,
      });
    });

    it('accepts exactly the surplus', async () => {
      const xeno = await asQC(ctx, 'X');
      await xeno
        .post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 8,
        })
        .expect(201);
    });

    it('is only lowered to 15% by the City Director at level 5', async () => {
      const cd = await asCD(ctx);
      const tooEarly = await cd.post('/catastrophe/retention-override', { pct: 0.15 });
      expectViolation(tooEarly, 'ROLE_NOT_PERMITTED_AT_LEVEL', 403);

      await setCatastropheLevel(ctx, 5);
      const lc = await asLC(ctx);
      const wrongRole = await lc.post('/catastrophe/retention-override', { pct: 0.15 });
      expectViolation(wrongRole, 'ROLE_NOT_PERMITTED_AT_LEVEL', 403);

      const wrongValue = await cd.post('/catastrophe/retention-override', { pct: 0.05 });
      expectViolation(wrongValue, 'RETENTION_PCT_NOT_ALLOWED', 422);

      await cd.post('/catastrophe/retention-override', { pct: 0.15 }).expect(201);

      const stocks = await cd.get('/stocks?district=A').expect(200);
      const medical = stocks.body.find(
        (s: { resourceCode: string }) => s.resourceCode === 'MEDICAL_PERSONNEL',
      );
      expect(medical).toMatchObject({ retentionMinimum: 2, transferableSurplus: 10 });
    });
  });

  describe('6. adjacency priority (annex rule #2)', () => {
    it('refuses a distant supplier while a neighbour of the destination can cover it', async () => {
      await setCatastropheLevel(ctx, 4);
      const lc = await asLC(ctx);

      await setStock(ctx, 'W', 'RESCUE_TEAMS', { current: 10, retentionBase: 3 });

      const response = await lc.post('/transfers', {
        sourceDistrict: 'E',
        destinationDistrict: 'Z',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 2,
      });

      expectViolation(response, 'ADJACENT_SOURCE_AVAILABLE', 422);
      expect(response.body.details).toMatchObject({ adjacentCandidate: 'W' });
    });
  });

  describe('7. full transfer lifecycle', () => {
    it('goes from request to delivery and actually moves the stock', async () => {
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
      const id = created.body.id;

      let source = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
      expect(source).toMatchObject({ currentQuantity: 12, committedOutbound: 3 });

      expectViolation(await xeno.post(`/transfers/${id}/approve`), 'OUT_OF_SCOPE_QUARTER', 403);

      const approved = await apex.post(`/transfers/${id}/approve`).expect(201);
      expect(approved.body.status).toBe('APPROVED');
      expect(approved.body.estimatedDeliveryAt).not.toBeNull();

      expectViolation(await apex.post(`/transfers/${id}/deliver`), 'OUT_OF_SCOPE_QUARTER', 403);

      await xeno.post(`/transfers/${id}/deliver`).expect(201);

      source = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
      const destination = await readStock(ctx, 'X', 'MEDICAL_PERSONNEL');
      expect(source).toMatchObject({ currentQuantity: 9, committedOutbound: 0 });
      expect(destination.currentQuantity).toBe(6); // Xeno started at 3
    });

    it('returns the committed units to the pool when the transfer is refused', async () => {
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

      await apex.post(`/transfers/${created.body.id}/reject`, { reason: 'Needed locally' }).expect(201);

      const stock = await readStock(ctx, 'A', 'MEDICAL_PERSONNEL');
      expect(stock).toMatchObject({ currentQuantity: 12, committedOutbound: 0 });
    });

    it('requires the intermediate quarter to approve its own leg', async () => {
      await setCatastropheLevel(ctx, 4);
      await setStock(ctx, 'W', 'RESCUE_TEAMS', { current: 1 });
      await setStock(ctx, 'X', 'RESCUE_TEAMS', { current: 2 });
      const lc = await asLC(ctx);
      const echo = await asQC(ctx, 'E');
      const xeno = await asQC(ctx, 'X');

      const created = await lc
        .post('/transfers', {
          sourceDistrict: 'E',
          destinationDistrict: 'Z',
          resourceCode: 'RESCUE_TEAMS',
          quantity: 3,
          mode: 'TRANSIT',
        })
        .expect(201);
      const id = created.body.id;

      const afterSource = await echo.post(`/transfers/${id}/approve`).expect(201);
      expect(afterSource.body.status).toBe('PENDING_TRANSIT_APPROVAL');

      const transitLeg = afterSource.body.legs.find(
        (l: { approvalRequired: boolean }) => l.approvalRequired,
      );

      expectViolation(
        await echo.post(`/transfers/${id}/legs/${transitLeg.id}/approve`),
        'OUT_OF_SCOPE_QUARTER',
        403,
      );

      const final = await xeno.post(`/transfers/${id}/legs/${transitLeg.id}/approve`).expect(201);
      expect(final.body.status).toBe('APPROVED');
    });
  });

  describe('8. requisition', () => {
    it('is the City Director’s alone, and does not bypass the retention floor', async () => {
      await setCatastropheLevel(ctx, 4);
      const cd = await asCD(ctx);
      const lc = await asLC(ctx);

      expectViolation(
        await lc.post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 1,
          requisition: true,
        }),
        'ROLE_NOT_PERMITTED_AT_LEVEL',
        403,
      );

      expectViolation(
        await cd.post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 9,
          requisition: true,
        }),
        'RETENTION_THRESHOLD_BREACH',
        422,
      );

      const ok = await cd
        .post('/transfers', {
          sourceDistrict: 'A',
          destinationDistrict: 'X',
          resourceCode: 'MEDICAL_PERSONNEL',
          quantity: 5,
          requisition: true,
        })
        .expect(201);
      expect(ok.body.status).toBe('APPROVED');
    });
  });

  describe('9. audit trail', () => {
    it('records the refusal with the code of the violated rule', async () => {
      await setCatastropheLevel(ctx, 3);
      const xeno = await asQC(ctx, 'X');

      await xeno.post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 9,
      });

      const entries = await ctx.prisma.auditLog.findMany({ where: { outcome: 'REJECTED' } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: 'TRANSFER_REQUEST',
        violationCode: 'RETENTION_THRESHOLD_BREACH',
        httpStatus: 422,
      });
    });
  });
});
