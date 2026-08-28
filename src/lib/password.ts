import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** Real salted password hashing (bcrypt) — replaces the mock's unsalted
 * SHA-256, per docs/BACKEND.md ("Do not port this as-is"). */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.bcryptRounds);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
