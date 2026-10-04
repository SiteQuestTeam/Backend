import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAccessGuard } from './admin-access.guard';

function context(authorization?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as any;
}

test('allows only the configured admin Bearer token when administration is enabled', () => {
  process.env.ADMIN_API_ENABLED = 'true';
  process.env.ADMIN_API_TOKEN = 'test-token';
  const guard = new AdminAccessGuard();

  assert.equal(guard.canActivate(context('Bearer test-token')), true);
  assert.throws(() => guard.canActivate(context('Bearer wrong')), { status: 401 });
});

test('hides administration when it is disabled', () => {
  delete process.env.ADMIN_API_ENABLED;
  process.env.ADMIN_API_TOKEN = 'test-token';
  const guard = new AdminAccessGuard();

  assert.throws(() => guard.canActivate(context('Bearer test-token')), { status: 404 });
});
