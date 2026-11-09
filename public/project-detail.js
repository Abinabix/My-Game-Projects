const escapeText = (value) => String(value ?? '');
const params = new URLSearchParams(location.search);
const previewId = params.get('preview');
const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');

function addSpec(label, value) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return null;
  const item = document.createElement('div'); item.className = 'spec-item';
  const title = document.createElement('span'); title.textContent = label.toUpperCase();
  const content = document.createElement('strong'); content.textContent = Array.isArray(value) ? value.join(' · ') : value;
  item.append(title, content); return item;
}

function externalLink(label, href, primary = false) {
  if (!href) return null;
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const anchor = document.createElement('a'); anchor.href = url.toString(); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = `${label} ↗`;
  if (primary) anchor.className = 'primary-link';
  return anchor;
}

function renderProject(project) {
  document.title = `${project.title} | ABIN.EXE`;
  document.querySelector('meta[name=description]').content = project.short_description || 'ABIN.EXE project archive';
  const content = document.querySelector('#projectContent'); content.hidden = false;
  document.querySelector('#projectCategory').textContent = [project.category, project.project_type].filter(Boolean).join(' / ') || 'PROJECT ARCHIVE';
  document.querySelector('#projectTitle').textContent = project.title;
  document.querySelector('#projectSummary').textContent = project.short_description || '';

  const links = document.querySelector('#projectLinks');
  for (const anchor of [
    externalLink('GITHUB REPOSITORY', project.github_url, true), externalLink('LIVE DEMO', project.live_demo_url),
    externalLink('GAME DEMO', project.game_url), externalLink('VIDEO', project.video_url),
  ]) if (anchor) links.append(anchor);
  if (!links.children.length) links.hidden = true;

  if (project.cover_image) {
    const figure = document.querySelector('#coverFigure'); figure.hidden = false;
    const image = document.querySelector('#coverImage'); image.src = project.cover_image; image.alt = project.cover_alt_text || `${project.title} cover image`;
    document.querySelector('#coverCaption').textContent = image.alt;
  }

  if (project.full_description) {
    document.querySelector('#descriptionSection').hidden = false;
    document.querySelector('#projectDescription').textContent = project.full_description;
  }

  const specs = document.querySelector('#projectSpecs');
  [
    ['Category', project.category], ['Project Type', project.project_type], ['Project Status', project.project_status], ['Engine', project.engine], ['Role', project.role],
    ['Platform', project.platform], ['Completion Date', project.completion_date ? new Date(project.completion_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : ''],
    ['Software & Tools', project.tools], ['Technologies', project.technologies], ['Technical Features', project.technical_features],
  ].forEach(([label, value]) => { const item = addSpec(label, value); if (item) specs.append(item); });
  if (specs.children.length) document.querySelector('#specsSection').hidden = false;

  const gallery = document.querySelector('#projectGallery');
  (project.images || []).forEach((entry) => {
    const figure = document.createElement('figure'); const image = document.createElement('img');
    image.src = entry.image_url; image.alt = entry.alt_text || `${project.title} project image`; image.loading = 'lazy';
    figure.append(image);
    if (entry.alt_text) { const caption = document.createElement('figcaption'); caption.textContent = entry.alt_text; figure.append(caption); }
    gallery.append(figure);
  });
  if (gallery.children.length) document.querySelector('#gallerySection').hidden = false;

  const credits = document.querySelector('#projectCredits');
  (project.credits || []).forEach((entry) => {
    const article = document.createElement('article'); article.className = 'credit-entry';
    const title = document.createElement('h3'); title.textContent = entry.resource_name; article.append(title);
    if (entry.creator) { const creator = document.createElement('p'); creator.textContent = `Creator: ${entry.creator}`; article.append(creator); }
    if (entry.license_type) { const license = document.createElement('p'); license.textContent = `License: ${entry.license_type}`; article.append(license); }
    if (entry.attribution_text) { const attribution = document.createElement('p'); attribution.textContent = entry.attribution_text; article.append(attribution); }
    const source = externalLink('SOURCE', entry.source_url); if (source) article.append(source);
    credits.append(article);
  });
  for (const [titleText, value] of [
    ['Copyright notice', project.copyright_notice], ['Project ownership', project.ownership_statement], ['Third-party acknowledgements', project.third_party_acknowledgements],
  ]) {
    if (!value) continue;
    const block = document.createElement('div'); block.className = 'copyright-block';
    const title = document.createElement('h3'); title.textContent = titleText;
    const text = document.createElement('p'); text.textContent = value; block.append(title, text); credits.append(block);
  }
  if (credits.children.length) document.querySelector('#creditsSection').hidden = false;
}

async function load() {
  const message = document.querySelector('#detailError');
  try {
    const endpoint = previewId
      ? `/api/admin/projects/${encodeURIComponent(previewId)}/preview`
      : `/api/projects/${encodeURIComponent(slug)}`;
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    const project = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(project.error || 'Project not found.');
    renderProject(project);
  } catch (error) {
    message.hidden = false;
    message.textContent = previewId ? 'Preview unavailable. Sign in to the admin dashboard and try again.' : error.message;
  }
}

load();
