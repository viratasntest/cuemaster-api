import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

/** Absolute path to the upload directory, created on first use. See
 * docs/BACKEND.md's Avatar Upload section — this is the "simplest for local
 * dev: save to disk under a directory served statically" option; swap for
 * S3/Cloudinary in production by changing only saveAvatarFile/deleteAvatarFile
 * below (and the static-serving line in app.ts) — the route/service contract
 * doesn't change. */
export const uploadDir = path.isAbsolute(env.uploadDir) ? env.uploadDir : path.join(process.cwd(), env.uploadDir);

export function ensureUploadDir(): void {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export function avatarUrlFor(filename: string): string {
  return `${env.publicBaseUrl}/uploads/${filename}`;
}

/** Extracts the filename back out of a URL this server generated, or null if
 * `url` doesn't point at our own upload dir (e.g. a Google/Facebook profile
 * picture from social login, or an absolute URL from a future S3 swap) — used
 * to avoid ever trying to delete a file we didn't create. */
export function filenameFromOwnUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = `${env.publicBaseUrl}/uploads/`;
  if (!url.startsWith(prefix)) return null;
  const filename = url.slice(prefix.length);
  // Reject anything that could escape uploadDir (defensive — multer's
  // generated filenames never contain a separator, but this URL could in
  // principle have been hand-edited via PATCH /users/me's avatarUrl field).
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null;
  return filename;
}

export function deleteAvatarFile(filename: string): void {
  fs.unlink(path.join(uploadDir, filename), () => {
    // Best-effort — a missing file (already deleted, or never existed) isn't
    // worth failing the request over.
  });
}
