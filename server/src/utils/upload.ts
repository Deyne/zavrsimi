import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

function ensureUploadDir() {
  if (!fs.existsSync(config.upload.dir)) {
    fs.mkdirSync(config.upload.dir, { recursive: true });
  }
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

export const listingImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        ensureUploadDir();
        cb(null, config.upload.dir);
      } catch (err) {
        cb(err as Error, config.upload.dir);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: config.upload.maxFileSize, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

export function assignUploadFilename(file: Express.Multer.File) {
  if (!file.filename) {
    (file as Express.Multer.File & { filename: string }).filename =
      `${uuidv4()}${path.extname(file.originalname)}`;
  }
  return file.filename;
}

export function fileToUrl(file: Express.Multer.File): string {
  return `/uploads/${file.filename}`;
}
