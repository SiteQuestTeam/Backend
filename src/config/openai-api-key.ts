import { readFileSync } from 'node:fs';

export const OPENAI_API_KEY_SECRET_PATH = '/run/secrets/OPENAI_API_KEY';

/**
 * Docker Swarm mounts secrets as files. Local development continues to use
 * OPENAI_API_KEY from the environment (usually loaded from .env).
 */
export function readOpenAiApiKey(
  environment: NodeJS.ProcessEnv = process.env,
  secretPath = OPENAI_API_KEY_SECRET_PATH,
): string | undefined {
  try {
    const secret = readFileSync(secretPath, 'utf8').trim();
    if (secret) return secret;
  } catch {
    // The secret is only present in Swarm; its absence is expected locally.
  }

  return environment.OPENAI_API_KEY?.trim() || undefined;
}
