import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readOpenAiApiKey } from './openai-api-key';

test('uses the trimmed Docker secret instead of the environment value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sidequest-openai-key-'));
  const secretPath = join(directory, 'OPENAI_API_KEY');
  writeFileSync(secretPath, ' secret-key\n');

  try {
    assert.equal(
      readOpenAiApiKey({ OPENAI_API_KEY: 'environment-key' }, secretPath),
      'secret-key',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('falls back to OPENAI_API_KEY when the Docker secret is unavailable or empty', () => {
  assert.equal(
    readOpenAiApiKey({ OPENAI_API_KEY: 'environment-key' }, join(tmpdir(), 'missing-openai-key')),
    'environment-key',
  );

  const directory = mkdtempSync(join(tmpdir(), 'sidequest-openai-key-'));
  const secretPath = join(directory, 'OPENAI_API_KEY');
  writeFileSync(secretPath, '  \n');

  try {
    assert.equal(readOpenAiApiKey({ OPENAI_API_KEY: 'environment-key' }, secretPath), 'environment-key');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
