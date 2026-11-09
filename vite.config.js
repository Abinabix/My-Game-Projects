import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const pages = new Map([
  ['/admin/login', 'public/admin/login.html'],
  ['/admin/dashboard', 'public/admin/dashboard.html'],
  ['/admin/projects', 'public/admin/projects.html'],
  ['/admin/projects/new', 'public/admin/project-editor.html'],
]);

export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [{
    name: 'portfolio-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        let file = pages.get(pathname);
        if (/^\/admin\/projects\/edit\/[^/]+\/?$/.test(pathname)) file = 'public/admin/project-editor.html';
        if (/^\/projects\/[^/]+\/?$/.test(pathname)) file = 'public/project.html';
        if (!file) return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(resolve(root, file)));
      });
    },
  }],
});
