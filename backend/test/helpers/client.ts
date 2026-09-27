import request from 'supertest';
import { TestContext, TEST_PASSWORD } from './app';

interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
}

export class Officer {
  constructor(
    private readonly ctx: TestContext,
    readonly email: string,
    readonly token: string,
    readonly profile: { id: string; role: string; districtCode: string | null },
  ) {}

  private req() {
    return request(this.ctx.app.getHttpServer());
  }

  get(path: string) {
    return this.req().get(`/api${path}`).set('Authorization', `Bearer ${this.token}`);
  }

  post(path: string, body: object | string = {}) {
    return this.req().post(`/api${path}`).set('Authorization', `Bearer ${this.token}`).send(body);
  }

  put(path: string, body: object | string = {}) {
    return this.req().put(`/api${path}`).set('Authorization', `Bearer ${this.token}`).send(body);
  }

  patch(path: string, body: object | string = {}) {
    return this.req().patch(`/api${path}`).set('Authorization', `Bearer ${this.token}`).send(body);
  }

  del(path: string) {
    return this.req().delete(`/api${path}`).set('Authorization', `Bearer ${this.token}`);
  }
}

export async function login(ctx: TestContext, email: string): Promise<Officer> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);

  return new Officer(ctx, email, response.body.accessToken, response.body.user);
}

export const asQC = (ctx: TestContext, districtCode: string) =>
  login(ctx, `qc.${districtCode.toLowerCase()}@test.local`);
export const asLC = (ctx: TestContext) => login(ctx, 'lc@test.local');
export const asCD = (ctx: TestContext) => login(ctx, 'cd@test.local');

export function expectViolation(
  response: { status: number; body: ApiError },
  code: string,
  httpStatus?: number,
) {
  expect({ code: response.body.code, status: response.status }).toEqual({
    code,
    status: httpStatus ?? response.status,
  });
  expect(typeof response.body.message).toBe('string');
  expect(response.body.message.length).toBeGreaterThan(10);
}
