import crypto from 'crypto';
import multer from 'multer';
import { env } from '../config/env';
import { uploadDir } from '../lib/uploads';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXTENSION_BY_MIME[file.mimetype] ?? '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/** POST /users/me/avatar's multipart handler — see docs/BACKEND.md's Avatar
 * Upload section: reject anything that isn't jpeg/png/webp and cap size,
 * "the client already downsamples... but never trust that alone." Multer
 * errors (wrong field name, oversized file, rejected type) reach
 * errorHandler.ts as a MulterError, handled there. */
export const avatarUpload = multer({
  storage,
  limits: { fileSize: env.avatarMaxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in EXTENSION_BY_MIME)) {
      cb(new Error('Avatar must be a JPEG, PNG, or WebP image.'));
      return;
    }
    cb(null, true);
  },
}).single('avatar');
