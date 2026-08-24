import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from './env';

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

/** General attachments: any file type, limited by MAX_UPLOAD_MB. */
export const uploadAny = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
});

/** Avatars: images only, kept small. */
export const uploadImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed here'));
  },
});

export function kindOf(mime: string) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function removeStoredFile(storedName?: string | null) {
  if (!storedName) return;
  fs.unlink(path.join(env.uploadDir, path.basename(storedName)), () => undefined);
}

/** Turn a public "/api/files/xyz.png" URL back into its stored filename. */
export function storedNameFromUrl(url?: string | null) {
  if (!url) return null;
  const match = /\/api\/files\/([^/?#]+)$/.exec(url);
  return match ? match[1] : null;
}
