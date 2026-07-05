import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { redis } from './database/redis';
import { checkDatabaseConnection } from './database';
import { runMigrations } from './database/migrate';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/errorHandler';
import { setupSocket } from './socket';
import { setIo } from './socket/ioInstance';
import { getStoredFile, importDiskFilesToDb } from './services/storedFileService';
import { ensurePlatformOwner } from './services/forumService';

import authRoutes from './routes/auth';
import listingRoutes from './routes/listings';
import reviewRoutes from './routes/reviews';
import messageRoutes, { supportRouter } from './routes/messages';
import forumRoutes from './routes/forum';
import usersRoutes from './routes/users';
import adminRoutes from './routes/admin';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: config.clientUrl, credentials: true },
});

if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true });
}
console.log('Upload folder:', path.resolve(config.upload.dir));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(globalLimiter);

app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const safeName = path.basename(req.params.filename);
    const file = await getStoredFile(safeName);
    if (file) {
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(file.data);
    }
  } catch {
    /* fallback to static */
  }
  next();
});
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Završi Mi API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth', usersRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/support', supportRouter);
app.use('/api/forum', forumRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/sitemap.xml', async (_req, res) => {
  const { query } = await import('./database');
  const listings = await query<{ id: string; updated_at: string }>(
    "SELECT id, updated_at FROM listings WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1000"
  );

  const urls = [
    { loc: config.clientUrl, priority: '1.0' },
    { loc: `${config.clientUrl}/oglasi`, priority: '0.9' },
    { loc: `${config.clientUrl}/forum`, priority: '0.8' },
    { loc: `${config.clientUrl}/mapa`, priority: '0.7' },
    ...listings.map(l => ({
      loc: `${config.clientUrl}/oglas/${l.id}`,
      lastmod: l.updated_at,
      priority: '0.6',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${(u as { lastmod?: string }).lastmod ? `<lastmod>${(u as { lastmod: string }).lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;

  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

app.use(notFound);
app.use(errorHandler);

setupSocket(io);
setIo(io);

async function start() {
  try {
    await checkDatabaseConnection();
    await runMigrations();
    await ensurePlatformOwner();
    await importDiskFilesToDb();
    await redis.connect().catch(() => console.warn('Redis not available, continuing without cache'));
    httpServer.listen(config.port, () => {
      console.log(`🚀 Završi Mi API running on port ${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { io };
