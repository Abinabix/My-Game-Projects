import { query } from '../db.js';

const projectColumns = `id, title, title_break_after, slug, short_description, full_description, cover_image, cover_public_id,
  cover_alt_text, github_url, live_demo_url, game_url, video_url, category, engine, role, tools,
  technologies, technical_features, platform, completion_date, copyright_notice, ownership_statement,
  third_party_acknowledgements, visual_label, project_type, project_status, status, is_featured, display_order, created_at, updated_at, published_at`;

export async function loadProject(id, executor = { query }) {
  const project = (await executor.query(`SELECT ${projectColumns} FROM projects WHERE id = $1`, [id])).rows[0];
  if (!project) return null;
  const [images, credits] = await Promise.all([
    executor.query('SELECT id, image_url, cloudinary_public_id, alt_text, display_order, created_at FROM project_images WHERE project_id = $1 ORDER BY display_order, id', [id]),
    executor.query('SELECT id, resource_name, creator, source_url, license_type, attribution_text, created_at FROM project_credits WHERE project_id = $1 ORDER BY id', [id]),
  ]);
  return { ...project, images: images.rows, credits: credits.rows };
}

export async function deleteCloudinaryAssets(publicIds) {
  const candidates = [...new Set(publicIds.filter(Boolean))];
  if (!candidates.length) return;
  const remaining = await query('SELECT cloudinary_public_id FROM projects WHERE cover_public_id = ANY($1::text[]) UNION SELECT cloudinary_public_id FROM project_images WHERE cloudinary_public_id = ANY($1::text[])', [candidates]);
  const referenced = new Set(remaining.rows.map((row) => row.cloudinary_public_id));
  const orphaned = candidates.filter((id) => !referenced.has(id));
  if (!orphaned.length) return;
  const { destroyImage } = await import('./cloudinary.js');
  await Promise.allSettled(orphaned.map((id) => destroyImage(id)));
}

export { projectColumns };
