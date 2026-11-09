import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { query, transaction } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { uploadImage } from '../services/cloudinary.js';
import { deleteCloudinaryAssets } from '../services/projects.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12, fields: 20 },
  fileFilter(_req, file, callback) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    callback(allowed.has(file.mimetype) ? null : Object.assign(new Error('Only JPG, PNG, and WEBP images are accepted.'), { status: 400 }), allowed.has(file.mimetype));
  },
});

function assertImageSignature(file) {
  const bytes = file.buffer;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(jpeg || png || webp)) throw Object.assign(new Error(`${file.originalname} is not a valid JPG, PNG, or WEBP image.`), { status: 400 });
}

function safeId(value, label = 'Project') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error(`${label} was not found.`), { status: 404 });
  return id;
}

router.post('/projects/:id/images', requireAdmin, upload.array('images', 12), async (req, res, next) => {
  let uploadedIds = [];
  try {
    const projectId = safeId(req.params.id);
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Choose at least one image.' });
    if (files.reduce((total, file) => total + file.size, 0) > 60 * 1024 * 1024) return res.status(413).json({ error: 'The combined upload limit is 60 MB per request.' });
    files.forEach(assertImageSignature);
    const project = (await query('SELECT id, cover_public_id FROM projects WHERE id = $1', [projectId])).rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const uploadType = req.body.type === 'cover' ? 'cover' : 'gallery';
    if (uploadType === 'cover' && files.length !== 1) return res.status(400).json({ error: 'Upload one cover image at a time.' });
    const replaceId = req.body.replace_image_id ? safeId(req.body.replace_image_id, 'Image') : null;
    let replacedImage;
    if (replaceId) {
      replacedImage = (await query('SELECT id, project_id, cloudinary_public_id, display_order, alt_text FROM project_images WHERE id = $1', [replaceId])).rows[0];
      if (!replacedImage || Number(replacedImage.project_id) !== projectId || files.length !== 1 || uploadType === 'cover') {
        return res.status(404).json({ error: 'Gallery image not found.' });
      }
    }

    let altTexts = [];
    try { altTexts = Array.isArray(JSON.parse(req.body.alt_texts || '[]')) ? JSON.parse(req.body.alt_texts || '[]') : []; } catch {}
    const uploads = await Promise.all(files.map(async (file, index) => {
      const result = await uploadImage(file.buffer, { folder: `abin-exe/projects/${projectId}`, publicId: `${randomUUID()}` });
      uploadedIds.push(result.public_id);
      return { result, alt: typeof altTexts[index] === 'string' ? altTexts[index].trim().slice(0, 300) : file.originalname.slice(0, 300) };
    }));

    if (uploadType === 'cover') {
      const oldId = await transaction(async (client) => {
        const result = await client.query('UPDATE projects SET cover_image = $1, cover_public_id = $2, cover_alt_text = $3, updated_at = NOW() WHERE id = $4 RETURNING cover_public_id', [uploads[0].result.secure_url, uploads[0].result.public_id, uploads[0].alt, projectId]);
        if (!result.rowCount) throw Object.assign(new Error('Project not found.'), { status: 404 });
        return project.cover_public_id;
      });
      uploadedIds = [];
      await deleteCloudinaryAssets([oldId]);
      return res.status(201).json({ cover_image: uploads[0].result.secure_url, cover_public_id: uploads[0].result.public_id, cover_alt_text: uploads[0].alt });
    }

    const images = await transaction(async (client) => {
      if (replaceId) {
        const { rows } = await client.query('UPDATE project_images SET image_url = $1, cloudinary_public_id = $2, alt_text = $3 WHERE id = $4 AND project_id = $5 RETURNING id, image_url, cloudinary_public_id, alt_text, display_order', [uploads[0].result.secure_url, uploads[0].result.public_id, uploads[0].alt, replaceId, projectId]);
        return rows;
      }
      const max = Number((await client.query('SELECT COALESCE(MAX(display_order), -1) AS max_order FROM project_images WHERE project_id = $1', [projectId])).rows[0].max_order);
      const rows = [];
      for (const [index, item] of uploads.entries()) {
        const result = await client.query('INSERT INTO project_images (project_id, image_url, cloudinary_public_id, alt_text, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING id, image_url, cloudinary_public_id, alt_text, display_order', [projectId, item.result.secure_url, item.result.public_id, item.alt, max + index + 1]);
        rows.push(result.rows[0]);
      }
      return rows;
    });
    uploadedIds = [];
    if (replacedImage) await deleteCloudinaryAssets([replacedImage.cloudinary_public_id]);
    res.status(201).json({ images });
  } catch (error) {
    await Promise.allSettled(uploadedIds.map(async (id) => {
      const { destroyImage } = await import('../services/cloudinary.js');
      return destroyImage(id);
    }));
    next(error);
  }
});

router.delete('/projects/:id/cover', requireAdmin, async (req, res, next) => {
  try {
    const projectId = safeId(req.params.id);
    const oldCoverId = await transaction(async (client) => {
      const found = await client.query('SELECT cover_public_id, status FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      if (!found.rowCount) return null;
      await client.query(`UPDATE projects SET cover_image = NULL, cover_public_id = NULL, cover_alt_text = '',
        status = CASE WHEN status = 'published' THEN 'draft' ELSE status END,
        published_at = CASE WHEN status = 'published' THEN NULL ELSE published_at END,
        updated_at = NOW() WHERE id = $1`, [projectId]);
      return found.rows[0].cover_public_id;
    });
    const exists = await query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Project not found.' });
    await deleteCloudinaryAssets([oldCoverId]);
    res.json({ removed: true });
  } catch (error) { next(error); }
});

router.patch('/projects/:id/images/reorder', requireAdmin, async (req, res, next) => {
  try {
    const projectId = safeId(req.params.id);
    const imageIds = req.body?.image_ids;
    if (!Array.isArray(imageIds) || imageIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1) || new Set(imageIds.map(Number)).size !== imageIds.length) {
      return res.status(400).json({ error: 'Provide each gallery image ID once.' });
    }
    await transaction(async (client) => {
      const current = await client.query('SELECT id FROM project_images WHERE project_id = $1 ORDER BY display_order, id', [projectId]);
      const expected = new Set(current.rows.map((row) => Number(row.id)));
      if (expected.size !== imageIds.length || imageIds.some((id) => !expected.has(Number(id)))) {
        throw Object.assign(new Error('The gallery changed. Reload before reordering.'), { status: 409 });
      }
      for (const [position, id] of imageIds.entries()) await client.query('UPDATE project_images SET display_order = $1 WHERE id = $2 AND project_id = $3', [position, id, projectId]);
    });
    res.json({ saved: true });
  } catch (error) { next(error); }
});

router.delete('/images/:id', requireAdmin, async (req, res, next) => {
  try {
    const imageId = safeId(req.params.id, 'Image');
    const result = await query('DELETE FROM project_images WHERE id = $1 RETURNING cloudinary_public_id', [imageId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Image not found.' });
    await deleteCloudinaryAssets([result.rows[0].cloudinary_public_id]);
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

router.patch('/images/:id', requireAdmin, async (req, res, next) => {
  try {
    const imageId = safeId(req.params.id, 'Image');
    const altText = typeof req.body?.alt_text === 'string' ? req.body.alt_text.trim() : null;
    if (altText === null || altText.length > 300) return res.status(400).json({ error: 'Alt text must be 300 characters or fewer.' });
    const result = await query('UPDATE project_images SET alt_text = $1 WHERE id = $2 RETURNING id, alt_text', [altText, imageId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Image not found.' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

export default router;
