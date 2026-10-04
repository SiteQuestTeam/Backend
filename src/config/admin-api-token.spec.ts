import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readAdminApiToken } from './admin-api-token';

test('uses the trimmed admin token from a Docker secret before the environment value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sidequest-admin-token-'));
  const secretPath = join(directory, 'ADMIN_API_TOKEN');
  writeFileSync(secretPath, ' qazwsx\n');

  try {
    assert.equal(readAdminApiToken({ ADMIN_API_TOKEN: 'environment-token' }, secretPath), 'qazwsx');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('falls back to ADMIN_API_TOKEN when the Docker secret is unavailable', () => {
  assert.equal(
    readAdminApiToken({ ADMIN_API_TOKEN: 'environment-token' }, join(tmpdir(), 'missing-admin-token')),
    'environment-token',
  );
});
