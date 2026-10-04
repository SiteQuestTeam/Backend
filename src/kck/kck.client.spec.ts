import assert from 'node:assert/strict';
import test from 'node:test';
import { KckClient, KckConfigurationError } from './kck.client';

test('does not fabricate a KCK identifier when live integration is disabled', async () => {
  const previous = process.env.KCK_MODE;
  process.env.KCK_MODE = 'disabled';
  try {
    const client = new KckClient();
    await assert.rejects(
      () => client.submitIncident({} as any, { buffer: Buffer.from('photo'), mimeType: 'image/jpeg', fileName: 'photo.jpg' }),
      KckConfigurationError,
    );
  } finally {
    if (previous === undefined) delete process.env.KCK_MODE;
    else process.env.KCK_MODE = previous;
  }
});
