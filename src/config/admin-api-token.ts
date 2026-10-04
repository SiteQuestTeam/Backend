import { readFileSync } from 'node:fs';

export const ADMIN_API_TOKEN_SECRET_PATH = '/run/secrets/ADMIN_API_TOKEN';

/** Docker Swarm secret first; environment variable remains available locally. */
export function readAdminApiToken(
  environment: NodeJS.ProcessEnv = process.env,
  secretPath = ADMIN_API_TOKEN_SECRET_PATH,
): string | undefined {
  try {
    const secret = readFileSync(secretPath, 'utf8').trim();
    if (secret) return secret;
  } catch {
    // The secret exists only in Swarm; its absence is expected locally.
  }

  return environment.ADMIN_API_TOKEN?.trim() || undefined;
}
