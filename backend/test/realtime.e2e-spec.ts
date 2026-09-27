import { io, Socket } from 'socket.io-client';
import {
  TestContext,
  createTestApp,
  resetDatabase,
  setCatastropheLevel,
} from './helpers/app';
import { Officer, asCD, asQC } from './helpers/client';

describe('real-time broadcasting', () => {
  let ctx: TestContext;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
  });

  afterEach(() => {
    while (sockets.length > 0) sockets.pop()?.disconnect();
  });

  function connect(token: string): Promise<Socket> {
    const socket = io(`${ctx.url}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket did not connect in time')), 5000);
    });
  }

  function nextEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "${event}" within ${timeoutMs}ms`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  it('refuses a socket with no token', async () => {
    await expect(connect('not-a-real-token')).rejects.toBeDefined();
  });

  it('broadcasts an escalation to every connected officer', async () => {
    const cd: Officer = await asCD(ctx);
    const watcher: Officer = await asQC(ctx, 'W');
    const socket = await connect(watcher.token);

    const received = nextEvent<{ previousLevel: number; newLevel: number; direction: string }>(
      socket,
      'catastrophe.level.changed',
    );

    await cd.put('/catastrophe/level', { level: 4, reason: 'Kaiju sighted' }).expect(200);

    await expect(received).resolves.toMatchObject({
      previousLevel: 1,
      newLevel: 4,
      direction: 'ESCALATION',
    });
  });

  it('broadcasts a de-escalation just the same', async () => {
    await setCatastropheLevel(ctx, 4);
    const cd = await asCD(ctx);
    const socket = await connect((await asQC(ctx, 'W')).token);

    const received = nextEvent<{ direction: string }>(socket, 'catastrophe.level.changed');
    await cd.put('/catastrophe/level', { level: 2 }).expect(200);

    await expect(received).resolves.toMatchObject({ direction: 'DE_ESCALATION' });
  });

  it('pushes a resource status update to the quarter concerned', async () => {
    await setCatastropheLevel(ctx, 2);
    const apex = await asQC(ctx, 'A');
    const socket = await connect(apex.token);

    const received = nextEvent<{ resourceCode: string; available: number; reason: string }>(
      socket,
      'resource.updated',
    );

    await apex
      .post('/reservations', {
        districtCode: 'A',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 2,
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .expect(201);

    await expect(received).resolves.toMatchObject({
      resourceCode: 'MEDICAL_PERSONNEL',
      available: 10,
      reason: 'RESERVATION',
    });
  });

  it('alerts on a conflict when two teams target the same scarce resource', async () => {
    await setCatastropheLevel(ctx, 3);
    const xeno = await asQC(ctx, 'X');
    const echo = await asQC(ctx, 'E');
    const observer = await connect((await asQC(ctx, 'A')).token);

    await xeno
      .post('/transfers', {
        sourceDistrict: 'A',
        destinationDistrict: 'X',
        resourceCode: 'MEDICAL_PERSONNEL',
        quantity: 8,
      })
      .expect(201);

    const conflict = nextEvent<{ resourceCode: string; contenders: unknown[] }>(
      observer,
      'transfer.conflict',
    );

    const refused = await echo.post('/transfers', {
      sourceDistrict: 'A',
      destinationDistrict: 'E',
      resourceCode: 'MEDICAL_PERSONNEL',
      quantity: 1,
    });
    expect(refused.status).toBe(422);

    const payload = await conflict;
    expect(payload.resourceCode).toBe('MEDICAL_PERSONNEL');
    expect(payload.contenders.length).toBeGreaterThan(0);
  });

  it('does not leak another quarter’s resource updates to a Quarter Coordinator', async () => {
    await setCatastropheLevel(ctx, 2);
    const apex = await asQC(ctx, 'A');
    const echo = await asQC(ctx, 'E');
    const apexSocket = await connect(apex.token);

    let leaked = false;
    apexSocket.on('resource.updated', () => {
      leaked = true;
    });

    await echo
      .post('/reservations', {
        districtCode: 'E',
        resourceCode: 'RESCUE_TEAMS',
        quantity: 1,
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .expect(201);

    await new Promise((r) => setTimeout(r, 500));
    expect(leaked).toBe(false);
  });
});
