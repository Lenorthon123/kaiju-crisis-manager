// Real PostgreSQL on purpose: row locks and transaction isolation do not
// exist in a mock.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Run `npm run test:e2e`, which starts the test database first.',
  );
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-value-long-enough';
process.env.PORT ??= '0';
