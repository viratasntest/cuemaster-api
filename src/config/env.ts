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
};
