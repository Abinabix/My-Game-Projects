# ABIN.EXE Portfolio

The existing Vite and vanilla JavaScript portfolio, GSAP motion, and embedded Kangaroo Dash game are served with a small Express CMS API. Project archive cards use published projects from PostgreSQL and keep the existing card markup and styles.

## Development

Requires Node.js 20.19+ and PostgreSQL. Configure `.env` from `.env.example`, then install dependencies:

```bash
npm install
npm run migrate
npm run create-admin
```

Run the API and Vite separately in two terminals:

```bash
npm run dev:server
npm run dev
```

Vite runs on port 5173 and proxies `/api` to Express on port 3000. The server applies pending migrations at startup as well.

## Production

```bash
npm run build
npm start
```

Express serves the generated `dist` directory, API, project pages, admin routes, and `/kangaroo.html`. See [ADMIN_SETUP.md](ADMIN_SETUP.md) for database, Cloudinary, administrator, and Render setup.

## Admin routes

- `/admin/login`
- `/admin/dashboard`
- `/admin/projects`
- `/admin/projects/new`
- `/admin/projects/edit/:id`
- `/projects/:slug`

The first admin is created through the interactive `npm run create-admin` command. Public registration is disabled. Cloudinary is required to upload images; uploaded files are never stored on the Render filesystem.
