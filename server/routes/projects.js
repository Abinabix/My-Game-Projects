import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { deleteCloudinaryAssets, loadProject, projectColumns } from '../services/projects.js';
import { validateProject } from '../services/validation.js';

const publicRouter = Router();
const adminRouter = Router();

function publicProject(project) {
  if (!project) return project;
  const { cover_public_id, ...safeProject } = project;
  safeProject.images = project.images.map(({ cloudinary_public_id, ...image }) => image);
  return safeProject;
}

function projectId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Project not found.'), { status: 404 });
  return id;
}

async function saveCredits(client, id, credits) {
  await client.query('DELETE FROM project_credits WHERE project_id = $1', [id]);
  for (const credit of credits) {
    await client.query('INSERT INTO project_credits (project_id, resource_name, creator, source_url, license_type, attribution_text) VALUES ($1, $2, $3, $4, $5, $6)', [id, credit.resource_name, credit.creator, credit.source_url, credit.license_type, credit.attribution_text]);
  }
}

publicRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${projectColumns} FROM projects WHERE status = 'published' ORDER BY display_order ASC, published_at DESC NULLS LAST, id ASC`);
    const projects = await Promise.all(rows.map((row) => loadProject(row.id)));
    res.json(projects.map(publicProject));
  } catch (error) { next(error); }
});

publicRouter.get('/:slug', async (req, res, next) => {
  try {
    const result = await query(`SELECT id FROM projects WHERE slug = $1 AND status = 'published' LIMIT 1`, [req.params.slug]);
    if (!result.rowCount) return res.status(404).json({ error: 'Project not found.' });
    res.json(publicProject(await loadProject(result.rows[0].id)));
  } catch (error) { next(error); }
});

adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [counts, recent] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
        COUNT(*) FILTER (WHERE is_featured)::int AS featured FROM projects`),
      query(`SELECT id, title, slug, category, status, is_featured, display_order, created_at, cover_image
        FROM projects ORDER BY updated_at DESC, id DESC LIMIT 8`),
    ]);
    res.json({ stats: counts.rows[0], recent: recent.rows });
  } catch (error) { next(error); }
});

adminRouter.get('/projects', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    const status = ['draft', 'published'].includes(req.query.status) ? req.query.status : 'all';
    const sortColumns = { display_order: 'display_order', title: 'title', updated_at: 'updated_at', created_at: 'created_at', published_at: 'published_at' };
    const sort = sortColumns[req.query.sort] || 'updated_at';
    const direction = req.query.direction === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await query(`SELECT ${projectColumns} FROM projects
      WHERE ($1 = '' OR title ILIKE '%' || $1 || '%' OR slug ILIKE '%' || $1 || '%' OR category ILIKE '%' || $1 || '%')
      AND ($2 = 'all' OR status = $2)
      ORDER BY ${sort} ${direction} NULLS LAST, id DESC`, [search, status]);
    res.json(await Promise.all(rows.map((row) => loadProject(row.id))));
  } catch (error) { next(error); }
});

adminRouter.post('/projects', async (req, res, next) => {
  try {
    const project = validateProject(req.body);
    if (project.status === 'published') return res.status(422).json({ error: 'Upload a cover image before publishing.' });
    const created = await transaction(async (client) => {
      const result = await client.query(`INSERT INTO projects
        (title, title_break_after, slug, short_description, full_description, github_url, live_demo_url, game_url, video_url, category, visual_label, project_type, project_status, engine, role, tools, technologies, technical_features, platform, completion_date, copyright_notice, ownership_statement, third_party_acknowledgements, status, is_featured, display_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19,$20,$21,$22,$23,'draft',$24,$25)
        RETURNING id`, [project.title, project.title_break_after, project.slug, project.short_description, project.full_description, project.github_url, project.live_demo_url, project.game_url, project.video_url, project.category, project.visual_label, project.project_type, project.project_status, project.engine, project.role, JSON.stringify(project.tools), JSON.stringify(project.technologies), JSON.stringify(project.technical_features), project.platform, project.completion_date, project.copyright_notice, project.ownership_statement, project.third_party_acknowledgements, project.is_featured, project.display_order]);
      await saveCredits(client, result.rows[0].id, project.credits);
      return result.rows[0].id;
    });
    res.status(201).json({ project: await loadProject(created) });
  } catch (error) { next(error); }
});

adminRouter.get('/projects/:id/preview', async (req, res, next) => {
  try {
    const project = await loadProject(projectId(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(publicProject(project));
  } catch (error) { next(error); }
});

adminRouter.post('/projects/:id/duplicate', async (req, res, next) => {
  try {
    const id = projectId(req.params.id);
    const createdId = await transaction(async (client) => {
      const original = (await client.query(`SELECT ${projectColumns} FROM projects WHERE id = $1`, [id])).rows[0];
      if (!original) throw Object.assign(new Error('Project not found.'), { status: 404 });
      const base = original.slug.slice(0, 165);
      let suffix = '-copy';
      let slug = `${base}${suffix}`;
      let sequence = 2;
      while ((await client.query('SELECT 1 FROM projects WHERE slug = $1', [slug])).rowCount) {
        suffix = `-copy-${sequence++}`;
        slug = `${base.slice(0, 180 - suffix.length)}${suffix}`;
      }
      const insert = await client.query(`INSERT INTO projects
        (title, title_break_after, slug, short_description, full_description, cover_image, cover_public_id, cover_alt_text, github_url, live_demo_url, game_url, video_url, category, visual_label, project_type, project_status, engine, role, tools, technologies, technical_features, platform, completion_date, copyright_notice, ownership_statement, third_party_acknowledgements, status, is_featured, display_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'draft',FALSE,$27) RETURNING id`, [
        `${original.title} (Copy)`, original.title_break_after, slug, original.short_description, original.full_description, original.cover_image, original.cover_public_id, original.cover_alt_text, original.github_url, original.live_demo_url, original.game_url, original.video_url, original.category, original.visual_label, original.project_type, original.project_status, original.engine, original.role, JSON.stringify(original.tools), JSON.stringify(original.technologies), JSON.stringify(original.technical_features), original.platform, original.completion_date, original.copyright_notice, original.ownership_statement, original.third_party_acknowledgements, original.display_order,
      ]);
      const newId = insert.rows[0].id;
      await client.query(`INSERT INTO project_images (project_id, image_url, cloudinary_public_id, alt_text, display_order)
        SELECT $1, image_url, cloudinary_public_id, alt_text, display_order FROM project_images WHERE project_id = $2`, [newId, id]);
      await client.query(`INSERT INTO project_credits (project_id, resource_name, creator, source_url, license_type, attribution_text)
        SELECT $1, resource_name, creator, source_url, license_type, attribution_text FROM project_credits WHERE project_id = $2`, [newId, id]);
      return newId;
    });
    res.status(201).json({ project: await loadProject(createdId) });
  } catch (error) { next(error); }
});

adminRouter.get('/projects/:id', async (req, res, next) => {
  try {
    const project = await loadProject(projectId(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(project);
  } catch (error) { next(error); }
});

adminRouter.put('/projects/:id', async (req, res, next) => {
  try {
    const id = projectId(req.params.id);
    const project = validateProject(req.body);
    const saved = await transaction(async (client) => {
      const existing = (await client.query('SELECT cover_image FROM projects WHERE id = $1', [id])).rows[0];
      if (!existing) throw Object.assign(new Error('Project not found.'), { status: 404 });
      if (project.status === 'published' && !existing.cover_image) throw Object.assign(new Error('Upload a cover image before publishing.'), { status: 422 });
      await client.query(`UPDATE projects SET
        title=$1, title_break_after=$2, slug=$3, short_description=$4, full_description=$5, github_url=$6, live_demo_url=$7, game_url=$8, video_url=$9,
        category=$10, visual_label=$11, project_type=$12, project_status=$13, engine=$14, role=$15, tools=$16::jsonb, technologies=$17::jsonb, technical_features=$18::jsonb,
        platform=$19, completion_date=$20, cover_alt_text=$21, copyright_notice=$22, ownership_statement=$23, third_party_acknowledgements=$24,
        status=$25, is_featured=$26, display_order=$27, updated_at=NOW(),
        published_at=CASE WHEN $25='published' THEN COALESCE(published_at, NOW()) ELSE NULL END WHERE id=$28`, [
        project.title, project.title_break_after, project.slug, project.short_description, project.full_description, project.github_url, project.live_demo_url, project.game_url, project.video_url,
        project.category, project.visual_label, project.project_type, project.project_status, project.engine, project.role, JSON.stringify(project.tools), JSON.stringify(project.technologies), JSON.stringify(project.technical_features),
        project.platform, project.completion_date, project.cover_alt_text, project.copyright_notice, project.ownership_statement, project.third_party_acknowledgements,
        project.status, project.is_featured, project.display_order, id,
      ]);
      await saveCredits(client, id, project.credits);
      return id;
    });
    res.json({ project: await loadProject(saved) });
  } catch (error) { next(error); }
});

adminRouter.delete('/projects/:id', async (req, res, next) => {
  try {
    const id = projectId(req.params.id);
    const assets = await transaction(async (client) => {
      const result = await client.query('SELECT cover_public_id FROM projects WHERE id = $1', [id]);
      if (!result.rowCount) throw Object.assign(new Error('Project not found.'), { status: 404 });
      const images = await client.query('SELECT cloudinary_public_id FROM project_images WHERE project_id = $1', [id]);
      await client.query('DELETE FROM projects WHERE id = $1', [id]);
      return [result.rows[0].cover_public_id, ...images.rows.map((row) => row.cloudinary_public_id)];
    });
    await deleteCloudinaryAssets(assets);
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

export { adminRouter, publicRouter };
