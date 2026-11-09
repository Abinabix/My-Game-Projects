const allowedEngines = new Set(['Unreal Engine 5', 'Unity', 'Blender', 'Three.js', 'Other']);

function text(value, field, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw Object.assign(new Error(`${field} must be text.`), { status: 400 });
  const clean = value.trim();
  if (required && !clean) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  if (clean.length > maxLength) throw Object.assign(new Error(`${field} must be ${maxLength} characters or fewer.`), { status: 400 });
  return clean;
}

export function optionalUrl(value, field) {
  const clean = text(value, field, 2048);
  if (!clean) return null;
  let parsed;
  try { parsed = new URL(clean); } catch { throw Object.assign(new Error(`${field} must be a valid URL.`), { status: 400 }); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error(`${field} must be an HTTP or HTTPS URL.`), { status: 400 });
  }
  return parsed.toString();
}

function stringList(value, field) {
  if (value === undefined || value === null || value === '') return [];
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!entries) throw Object.assign(new Error(`${field} must be a list.`), { status: 400 });
  if (entries.length > 100) throw Object.assign(new Error(`${field} can contain up to 100 entries.`), { status: 400 });
  return [...new Set(entries.map((entry) => text(entry, field, 120)).filter(Boolean))];
}

function creditsList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) throw Object.assign(new Error('Credits must be a list of up to 50 entries.'), { status: 400 });
  return value.filter((credit) => credit && typeof credit === 'object').map((credit) => ({
    resource_name: text(credit.resource_name, 'Resource name', 200, { required: true }),
    creator: text(credit.creator, 'Creator', 200),
    source_url: optionalUrl(credit.source_url, 'Credit source URL'),
    license_type: text(credit.license_type, 'License type', 200),
    attribution_text: text(credit.attribution_text, 'Attribution text', 2000),
  }));
}

export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Project data is required.'), { status: 400 });
  const title = text(input.title, 'Project name', 160, { required: true });
  const slug = text(input.slug, 'URL slug', 180, { required: true }).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Object.assign(new Error('URL slug may contain lowercase letters, numbers, and single hyphens.'), { status: 400 });
  const shortDescription = text(input.short_description, 'Short description', 500, { required: true });
  const status = input.status === 'published' ? 'published' : input.status === 'draft' ? 'draft' : null;
  if (!status) throw Object.assign(new Error('Status must be draft or published.'), { status: 400 });
  const isFeatured = input.is_featured === true || input.is_featured === 'true' || input.is_featured === 'on';
  const displayOrder = Number(input.display_order ?? 0);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000000) throw Object.assign(new Error('Display order must be a non-negative whole number.'), { status: 400 });
  let completionDate = input.completion_date || null;
  if (completionDate !== null) {
    const parsed = typeof completionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(completionDate) ? new Date(`${completionDate}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== completionDate) {
      throw Object.assign(new Error('Completion date must be a valid date.'), { status: 400 });
    }
  }
  const engine = text(input.engine, 'Engine', 100);
  if (engine && !allowedEngines.has(engine)) throw Object.assign(new Error('Choose a supported engine.'), { status: 400 });

  return {
    title, slug, short_description: shortDescription,
    title_break_after: text(input.title_break_after, 'Title line break', 100),
    full_description: text(input.full_description, 'Full description', 20000),
    cover_alt_text: text(input.cover_alt_text, 'Cover image alt text', 300),
    github_url: optionalUrl(input.github_url, 'GitHub URL'),
    live_demo_url: optionalUrl(input.live_demo_url, 'Live demo URL'),
    game_url: optionalUrl(input.game_url, 'Game demo URL'),
    video_url: optionalUrl(input.video_url, 'Video URL'),
    category: text(input.category, 'Category', 120),
    visual_label: text(input.visual_label, 'Visual label', 160),
    project_type: text(input.project_type, 'Project type', 120),
    project_status: text(input.project_status, 'Project status', 120),
    engine,
    role: text(input.role, 'Role', 200),
    tools: stringList(input.tools, 'Tools'),
    technologies: stringList(input.technologies, 'Technologies'),
    technical_features: stringList(input.technical_features, 'Technical features'),
    platform: text(input.platform, 'Platform', 300),
    completion_date: completionDate,
    copyright_notice: text(input.copyright_notice, 'Copyright notice', 2000),
    ownership_statement: text(input.ownership_statement, 'Ownership statement', 2000),
    third_party_acknowledgements: text(input.third_party_acknowledgements, 'Third-party acknowledgements', 5000),
    status, is_featured: isFeatured, display_order: displayOrder,
    credits: creditsList(input.credits),
  };
}
