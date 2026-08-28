import { v4 as uuidv4 } from 'uuid';

/** Prefixed id generator — same shape as cuemaster-ui/src/utils/id.ts but
 * backed by uuid v4 instead of Math.random() now that ids are shared across
 * a real database and multiple clients. */
export function generateId(prefix: string): string {
  return `${prefix}_${uuidv4()}`;
}
