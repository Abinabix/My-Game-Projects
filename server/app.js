import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { requireAdminPage } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import { adminRouter, publicRouter } from './routes/projects.js';
import uploadRoutes from './routes/uploads.js';
import { runMigrations } from './scripts/migrate.js';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const adminDir = resolve(dist, 'admin');
const PgSession = connectPgSimple(session);

if (isProduction && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET must be configured in production.');
  process.exit(1);
}
if (isProduction) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The existing Kangaroo Dash document uses its inline game script and Tailwind CDN.
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const sessionMiddleware = session({
  name: 'abin.sid',
  store: new PgSession({ pool, tableName: 'sessions', createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
  secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  },
});

function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected.' });
    } catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
  }
  next();
}

app.use('/api/projects', publicRouter);
app.use('/api/admin', sessionMiddleware, sameOrigin);
app.use('/api/admin', authRoutes);
app.use('/api/admin', adminRouter);
app.use('/api/admin', uploadRoutes);

const sendAdminPage = (name) => (_req, res) => res.sendFile(resolve(adminDir, name));
app.get('/admin/login', sendAdminPage('login.html'));
app.get('/admin/dashboard', sessionMiddleware, requireAdminPage, sendAdminPage('dashboard.html'));
app.get('/admin/projects', sessionMiddleware, requireAdminPage, sendAdminPage('projects.html'));
app.get('/admin/projects/new', sessionMiddleware, requireAdminPage, sendAdminPage('project-editor.html'));
app.get('/admin/projects/edit/:id', sessionMiddleware, requireAdminPage, sendAdminPage('project-editor.html'));
app.get('/projects/:slug', (_req, res) => res.sendFile(resolve(dist, 'project.html')));

app.use(express.static(dist, { maxAge: isProduction ? '1h' : 0 }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(resolve(dist, 'index.html'));
  res.status(404).send('Not found.');
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const multerStatus = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.name === 'MulterError' ? 400 : 0;
  const status = Number(error.status || multerStatus || (error.code === '23505' ? 409 : 500));
  if (status >= 500) console.error('Request failed:', error);
  const message = error.code === '23505' ? 'That project slug is already in use.'
    : error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 12 MB or smaller.'
      : error.code === 'LIMIT_FILE_COUNT' ? 'Upload up to 12 images at a time.'
        : status < 500 ? error.message : 'The request could not be completed.';
  res.status(status).json({ error: message });
});

const port = Number.parseInt(process.env.PORT || '3000', 10);
const server = app.listen(port, '0.0.0.0', () => console.info(`ABIN.EXE server listening on port ${port}`));

try {
  await runMigrations();
} catch (error) {
  console.error('Database is unavailable or migrations failed. Static pages will remain available; the API will recover after the database is configured.', error.message);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await pool.end();
    process.exit(0);
  }));
}
