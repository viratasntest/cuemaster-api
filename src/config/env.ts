import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

// A single source of truth for session length — used both as the JWT's
// `expiresIn` and as the Session row's `expiresAt`, so the two never drift
// apart (see lib/jwt.ts).
const sessionLengthDays = Number(process.env.SESSION_LENGTH_DAYS ?? 30);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me'),
  sessionLengthDays,
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),

  // Social Login (docs/BACKEND.md) — Google's id_token `aud` claim must match
  // one of these; unset means social login is disabled with a clear error
  // rather than silently skipping audience verification.
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  facebookAppId: process.env.FACEBOOK_APP_ID,
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET,

  // Avatar Upload (docs/BACKEND.md) — the URL prefix returned avatarUrls are
  // built from; must be publicly reachable by app clients, not just this
  // machine. `uploadDir` is where files actually land on disk.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`).replace(/\/+$/, ''),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  avatarMaxBytes: Number(process.env.AVATAR_MAX_BYTES ?? 5 * 1024 * 1024),
};
