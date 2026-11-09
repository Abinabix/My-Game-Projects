const page = document.body.dataset.page;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (response.status === 401 && page !== 'login') {
    location.replace('/admin/login');
    throw new Error('Your session ended. Sign in again.');
  }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function showMessage(message, success = false) {
  const target = document.querySelector('.page-message');
  if (!target) return;
  target.textContent = message;
  target.style.color = success ? '#70e3a5' : '';
}

async function checkSession() {
  try {
    const result = await api('/api/admin/session');
    if (page === 'login' && result.authenticated) location.replace('/admin/dashboard');
    if (page !== 'login' && !result.authenticated) location.replace('/admin/login');
    return result;
  } catch (error) {
    if (page !== 'login') showMessage('ADMIN API UNAVAILABLE. Check the database and server connection.');
    return { authenticated: false, error };
  }
}

document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  location.replace('/admin/login');
}));

async function initLogin() {
  const form = document.querySelector('#loginForm');
  const message = form.querySelector('.form-message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value }) });
      location.replace('/admin/dashboard');
    } catch (error) {
      message.textContent = error.message;
      form.elements.password.value = '';
      form.elements.password.focus();
    } finally { button.disabled = false; }
  });
}

function projectTable(projects, { compact = false } = {}) {
  if (!projects.length) return '<div class="empty-state">NO PROJECTS MATCH THIS FILTER.</div>';
  const headers = compact
    ? '<th>PROJECT</th><th>STATUS</th><th>UPDATED</th><th>ACTIONS</th>'
    : '<th>PROJECT</th><th>CATEGORY</th><th>STATUS</th><th>ORDER</th><th>UPDATED</th><th>ACTIONS</th>';
  const rows = projects.map((project) => {
    const status = project.status === 'published' ? 'PUBLISHED' : 'DRAFT';
    const view = project.status === 'published' ? `<a class="icon-button" href="/projects/${encodeURIComponent(project.slug)}" target="_blank" rel="noopener">VIEW</a>` : '';
    return `<tr>
      <td><div class="project-cell"><div class="project-thumb ${project.cover_image ? '' : 'project-thumb-empty'}">${project.cover_image ? `<img src="${escapeHtml(project.cover_image)}" alt="" loading="lazy">` : 'A.'}</div><div><strong>${escapeHtml(project.title)}</strong><small>/${escapeHtml(project.slug)} ${project.is_featured ? '<span class="featured-mark">★ FEATURED</span>' : ''}</small></div></div></td>
      ${compact ? '' : `<td>${escapeHtml(project.category || '—')}</td>`}
      <td><span class="status-pill ${escapeHtml(project.status)}">${status}</span></td>
      ${compact ? '' : `<td>${Number(project.display_order) || 0}</td>`}
      <td class="project-date">${formatDate(project.updated_at || project.created_at)}</td>
      <td><div class="row-actions"><a class="icon-button" href="/admin/projects/edit/${project.id}">EDIT</a>${view}<button class="icon-button" data-action="duplicate" data-id="${project.id}">COPY</button><button class="icon-button danger" data-action="delete" data-id="${project.id}" data-title="${escapeHtml(project.title)}">DELETE</button></div></td>
    </tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function runProjectAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, title } = button.dataset;
  button.disabled = true;
  try {
    if (action === 'delete') {
      if (!confirm(`Delete “${title}”? This removes it from the public archive and cannot be undone.`)) return;
      await api(`/api/admin/projects/${id}`, { method: 'DELETE' });
      showMessage('Project deleted.', true);
      if (page === 'projects') await loadProjectList(); else await loadDashboard();
    }
    if (action === 'duplicate') {
      const { project } = await api(`/api/admin/projects/${id}/duplicate`, { method: 'POST', body: '{}' });
      location.assign(`/admin/projects/edit/${project.id}`);
    }
  } catch (error) { showMessage(error.message); }
  finally { button.disabled = false; }
}

async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard');
    document.querySelector('#dashboardStats').innerHTML = [
      ['TOTAL PROJECTS', data.stats.total, ''], ['PUBLISHED', data.stats.published, ''], ['DRAFTS', data.stats.drafts, ''], ['FEATURED', data.stats.featured, 'featured'],
    ].map(([label, count, extra]) => `<div class="stat-card ${extra}"><span>${label}</span><strong>${count}</strong></div>`).join('');
    document.querySelector('#recentProjects').innerHTML = projectTable(data.recent, { compact: true });
  } catch (error) { showMessage(error.message); }
}

async function initDashboard() {
  document.querySelector('#recentProjects').addEventListener('click', runProjectAction);
  await loadDashboard();
}

let listTimer;
async function loadProjectList() {
  const target = document.querySelector('#projectList');
  target.innerHTML = '<div class="empty-state">LOADING PROJECTS…</div>';
  const params = new URLSearchParams({
    search: document.querySelector('#projectSearch').value,
    status: document.querySelector('#projectStatus').value,
    sort: document.querySelector('#projectSort').value,
    direction: document.querySelector('#projectDirection').value,
  });
  try {
    target.innerHTML = projectTable(await api(`/api/admin/projects?${params}`));
  } catch (error) { target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function initProjects() {
  for (const control of document.querySelectorAll('#projectSearch,#projectStatus,#projectSort,#projectDirection')) {
    control.addEventListener(control.type === 'search' ? 'input' : 'change', () => {
      clearTimeout(listTimer);
      listTimer = setTimeout(loadProjectList, control.type === 'search' ? 180 : 0);
    });
  }
  document.querySelector('#projectList').addEventListener('click', runProjectAction);
  await loadProjectList();
}

function splitList(value) { return value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean); }

function payloadFromForm(form, status) {
  const value = (name) => form.elements.namedItem(name).value.trim();
  return {
    title: value('title'), title_break_after: value('title_break_after'), slug: value('slug'), short_description: value('short_description'), full_description: value('full_description'),
    cover_alt_text: value('cover_alt_text'), github_url: value('github_url'), live_demo_url: value('live_demo_url'), game_url: value('game_url'), video_url: value('video_url'),
    category: value('category'), visual_label: value('visual_label'), project_type: value('project_type'), project_status: value('project_status'), engine: value('engine'), role: value('role'), tools: splitList(value('tools')),
    technologies: splitList(value('technologies')), technical_features: splitList(value('technical_features')), platform: value('platform'),
    completion_date: value('completion_date') || null, copyright_notice: value('copyright_notice'), ownership_statement: value('ownership_statement'),
    third_party_acknowledgements: value('third_party_acknowledgements'), status, is_featured: form.elements.is_featured.checked,
    display_order: Number(value('display_order') || 0), credits: [...form.querySelectorAll('.credit-item')].map((item) => ({
      resource_name: item.querySelector('[name=resource_name]').value.trim(), creator: item.querySelector('[name=creator]').value.trim(),
      source_url: item.querySelector('[name=source_url]').value.trim(), license_type: item.querySelector('[name=license_type]').value.trim(),
      attribution_text: item.querySelector('[name=attribution_text]').value.trim(),
    })).filter((entry) => entry.resource_name),
  };
}

let editorProject = null;
let gallery = [];
let pendingGallery = [];
let coverFile = null;
let editorId = null;
let coverObjectUrl = null;

function addCredit(credit = {}) {
  const item = document.createElement('article');
  item.className = 'credit-item';
  item.innerHTML = `<h3>ASSET CREDIT</h3><button class="icon-button danger credit-remove" type="button">REMOVE</button><div class="credit-item-grid">
    <label><span>RESOURCE / ASSET NAME *</span><input name="resource_name" maxlength="200" value="${escapeHtml(credit.resource_name || '')}" required></label>
    <label><span>CREATOR</span><input name="creator" maxlength="200" value="${escapeHtml(credit.creator || '')}"></label>
    <label><span>SOURCE URL</span><input name="source_url" type="url" value="${escapeHtml(credit.source_url || '')}"></label>
    <label><span>LICENSE TYPE</span><input name="license_type" maxlength="200" value="${escapeHtml(credit.license_type || '')}" placeholder="CC BY 4.0"></label>
    <label class="wide"><span>ATTRIBUTION TEXT</span><textarea name="attribution_text" rows="2" maxlength="2000">${escapeHtml(credit.attribution_text || '')}</textarea></label>
  </div>`;
  item.querySelector('.credit-remove').addEventListener('click', () => item.remove());
  document.querySelector('#creditsList').append(item);
}

function renderCoverPreview() {
  const target = document.querySelector('#coverPreview');
  target.replaceChildren();
  if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  coverObjectUrl = null;
  const src = coverFile ? (coverObjectUrl = URL.createObjectURL(coverFile)) : editorProject?.cover_image;
  if (!src) return;
  const image = document.createElement('img');
  image.src = src;
  image.alt = document.querySelector('[name=cover_alt_text]').value || 'Project cover preview';
  target.append(image);
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'icon-button danger cover-remove'; remove.textContent = coverFile ? 'CLEAR SELECTED COVER' : 'REMOVE COVER';
  remove.addEventListener('click', async () => {
    if (coverFile) {
      coverFile = null; document.querySelector('#coverFile').value = ''; renderCoverPreview(); return;
    }
    if (!editorId || !confirm('Remove the cover image? A published project will become a draft.')) return;
    try {
      await api(`/api/admin/projects/${editorId}/cover`, { method: 'DELETE' });
      editorProject.cover_image = null; editorProject.cover_public_id = null;
      editorProject.status = 'draft'; editorProject.published_at = null;
      document.querySelector('[name=cover_alt_text]').value = '';
      document.querySelector('#editorStatus').textContent = 'DRAFT';
      document.querySelector('#editorStatus').classList.remove('published');
      renderCoverPreview(); showMessage('Cover removed. The project is saved as a draft.', true);
    } catch (error) { showMessage(error.message); }
  });
  target.append(remove);
}

function renderGallery() {
  const target = document.querySelector('#galleryPreview');
  target.replaceChildren();
  gallery.forEach((image, index) => {
    const card = document.createElement('div');
    card.className = 'gallery-item';
    const preview = document.createElement('img'); preview.src = image.image_url; preview.alt = image.alt_text || '';
    const alt = document.createElement('input'); alt.value = image.alt_text || ''; alt.maxLength = 300; alt.placeholder = 'Image alt text'; alt.setAttribute('aria-label', 'Gallery image alt text');
    alt.addEventListener('input', () => { image.alt_text = alt.value; });
    const actions = document.createElement('div'); actions.className = 'gallery-item-actions';
    const up = document.createElement('button'); up.type = 'button'; up.className = 'icon-button'; up.textContent = 'MOVE UP'; up.disabled = index === 0;
    up.addEventListener('click', () => { [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]]; renderGallery(); });
    const down = document.createElement('button'); down.type = 'button'; down.className = 'icon-button'; down.textContent = 'MOVE DOWN'; down.disabled = index === gallery.length - 1;
    down.addEventListener('click', () => { [gallery[index + 1], gallery[index]] = [gallery[index], gallery[index + 1]]; renderGallery(); });
    const replace = document.createElement('input'); replace.type = 'file'; replace.accept = 'image/jpeg,image/png,image/webp'; replace.title = 'Replace image'; replace.setAttribute('aria-label', `Replace gallery image ${index + 1}`);
    replace.addEventListener('change', async () => { if (replace.files[0]) await replaceGalleryImage(image.id, replace.files[0]); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button danger'; remove.textContent = 'REMOVE';
    remove.addEventListener('click', async () => {
      if (!confirm('Remove this gallery image?')) return;
      try { await api(`/api/admin/images/${image.id}`, { method: 'DELETE' }); gallery.splice(index, 1); renderGallery(); }
      catch (error) { showMessage(error.message); }
    });
    actions.append(up, down, remove);
    card.append(preview, alt, replace, actions);
    target.append(card);
  });
  pendingGallery.forEach((entry, index) => {
    const card = document.createElement('div'); card.className = 'gallery-item pending';
    const preview = document.createElement('img'); preview.src = entry.preview; preview.alt = entry.alt;
    const alt = document.createElement('input'); alt.value = entry.alt; alt.maxLength = 300; alt.placeholder = 'Image alt text'; alt.setAttribute('aria-label', 'New image alt text');
    alt.addEventListener('input', () => { entry.alt = alt.value; });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button danger'; remove.textContent = 'REMOVE';
    remove.addEventListener('click', () => { URL.revokeObjectURL(entry.preview); pendingGallery.splice(index, 1); renderGallery(); });
    card.append(preview, alt, remove); target.append(card);
  });
}

function setEditor(project) {
  editorProject = project;
  const form = document.querySelector('#projectForm');
  for (const field of ['title', 'title_break_after', 'slug', 'short_description', 'full_description', 'cover_alt_text', 'github_url', 'live_demo_url', 'game_url', 'video_url', 'category', 'visual_label', 'project_type', 'project_status', 'engine', 'role', 'platform', 'copyright_notice', 'ownership_statement', 'third_party_acknowledgements']) {
    form.elements.namedItem(field).value = project[field] || '';
  }
  for (const field of ['tools', 'technologies', 'technical_features']) form.elements.namedItem(field).value = Array.isArray(project[field]) ? project[field].join(', ') : '';
  form.elements.completion_date.value = dateValue(project.completion_date);
  form.elements.display_order.value = project.display_order ?? 0;
  form.elements.is_featured.checked = Boolean(project.is_featured);
  form.elements.published_at_display.value = dateValue(project.published_at);
  gallery = [...(project.images || [])].sort((a, b) => a.display_order - b.display_order);
  document.querySelector('#creditsList').replaceChildren();
  (project.credits || []).forEach(addCredit);
  document.querySelector('#editorTitle').innerHTML = `${escapeHtml(project.title || 'New project')}<span>.</span>`;
  const status = document.querySelector('#editorStatus');
  status.textContent = project.status === 'published' ? 'PUBLISHED' : 'DRAFT';
  status.classList.toggle('published', project.status === 'published');
  renderCoverPreview(); renderGallery();
}

function setUploadProgress(percent) {
  const progress = document.querySelector('#uploadProgress');
  progress.hidden = false;
  progress.querySelector('span').style.width = `${percent}%`;
  progress.querySelector('b').textContent = `${percent}%`;
}

function uploadImages(id, files, { type = 'gallery', alts = [], replaceId } = {}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    formData.append('type', type);
    formData.append('alt_texts', JSON.stringify(alts));
    if (replaceId) formData.append('replace_image_id', replaceId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/projects/${id}/images`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.addEventListener('progress', (event) => { if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100)); });
    xhr.addEventListener('load', () => {
      let result = {}; try { result = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(result);
      else reject(new Error(result.error || `Image upload failed (${xhr.status}).`));
    });
    xhr.addEventListener('error', () => reject(new Error('Image upload failed. Check your connection and try again.')));
    xhr.send(formData);
  });
}

async function loadEditor() {
  const form = document.querySelector('#projectForm');
  const match = location.pathname.match(/\/admin\/projects\/edit\/(\d+)/);
  editorId = match?.[1] || null;
  if (editorId) {
    try {
      editorProject = await api(`/api/admin/projects/${editorId}`);
      setEditor(editorProject);
    } catch (error) { showMessage(error.message); }
  } else {
    setEditor({ title: '', slug: '', status: 'draft', images: [], credits: [], tools: [], technologies: [], technical_features: [], display_order: 0 });
    document.querySelector('#editorTitle').innerHTML = 'New project<span>.</span>';
  }

  let slugEdited = Boolean(editorProject?.slug);
  form.elements.title.addEventListener('input', () => {
    if (!slugEdited) form.elements.slug.value = form.elements.title.value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
  });
  form.elements.slug.addEventListener('input', () => { slugEdited = true; });
  form.elements.cover_alt_text.addEventListener('input', renderCoverPreview);
  document.querySelector('#coverFile').addEventListener('change', () => { coverFile = document.querySelector('#coverFile').files[0] || null; renderCoverPreview(); });
  document.querySelector('#galleryFiles').addEventListener('change', () => {
    pendingGallery.push(...[...document.querySelector('#galleryFiles').files].map((file) => ({ file, alt: file.name.replace(/\.[^.]+$/, ''), preview: URL.createObjectURL(file) })));
    document.querySelector('#galleryFiles').value = '';
    renderGallery();
  });
  document.querySelector('#addCredit').addEventListener('click', () => addCredit());

  async function replaceGalleryImage(id, file) {
    try {
      await uploadImages(editorId, [file], { replaceId: id, alts: [gallery.find((image) => Number(image.id) === Number(id))?.alt_text || file.name] });
      editorProject = await api(`/api/admin/projects/${editorId}`); setEditor(editorProject); showMessage('Gallery image replaced.', true);
    } catch (error) { showMessage(error.message); }
    finally { document.querySelector('#uploadProgress').hidden = true; }
  }

  async function save(targetStatus, { preview = false } = {}) {
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const buttons = [...document.querySelectorAll('#previewProject,#saveDraft,#publishProject')];
    buttons.forEach((button) => { button.disabled = true; });
    showMessage('SAVING PROJECT…', true);
    const wasNew = !editorId;
    let previewWindow;
    if (preview) previewWindow = window.open('about:blank', '_blank', 'noopener');
    try {
      const payload = payloadFromForm(form, targetStatus);
      const baseStatus = targetStatus === 'published' && !editorProject?.cover_image && coverFile ? 'draft' : targetStatus;
      payload.status = wasNew ? 'draft' : baseStatus;
      let saved;
      if (wasNew) {
        const response = await api('/api/admin/projects', { method: 'POST', body: JSON.stringify(payload) });
        saved = response.project; editorId = String(saved.id);
        history.replaceState({}, '', `/admin/projects/edit/${editorId}`);
      } else {
        const response = await api(`/api/admin/projects/${editorId}`, { method: 'PUT', body: JSON.stringify(payload) });
        saved = response.project;
      }

      if (coverFile) {
        await uploadImages(editorId, [coverFile], { type: 'cover', alts: [form.elements.cover_alt_text.value.trim()] });
        coverFile = null; document.querySelector('#coverFile').value = '';
      }
      if (pendingGallery.length) {
        await uploadImages(editorId, pendingGallery.map((entry) => entry.file), { alts: pendingGallery.map((entry) => entry.alt) });
        pendingGallery.forEach((entry) => URL.revokeObjectURL(entry.preview)); pendingGallery = [];
      }
      const afterUploads = await api(`/api/admin/projects/${editorId}`);
      for (const image of gallery) await api(`/api/admin/images/${image.id}`, { method: 'PATCH', body: JSON.stringify({ alt_text: image.alt_text || '' }) });
      const selectedOrder = gallery.map((image) => Number(image.id)).filter((id) => afterUploads.images.some((image) => Number(image.id) === id));
      const newImageIds = afterUploads.images.map((image) => Number(image.id)).filter((id) => !selectedOrder.includes(id));
      const orderedIds = [...selectedOrder, ...newImageIds];
      if (orderedIds.length) await api(`/api/admin/projects/${editorId}/images/reorder`, { method: 'PATCH', body: JSON.stringify({ image_ids: orderedIds }) });

      if (targetStatus !== baseStatus || wasNew && targetStatus === 'published') {
        const finalPayload = payloadFromForm(form, targetStatus);
        await api(`/api/admin/projects/${editorId}`, { method: 'PUT', body: JSON.stringify(finalPayload) });
      }
      editorProject = await api(`/api/admin/projects/${editorId}`);
      setEditor(editorProject);
      document.querySelector('#uploadProgress').hidden = true;
      showMessage(targetStatus === 'published' ? 'Project published and added to the public archive.' : 'Draft saved.', true);
      if (preview && previewWindow) {
        previewWindow.location = `/projects/${encodeURIComponent(editorProject.slug)}?preview=${editorId}`;
      } else if (preview && !previewWindow) {
        showMessage('Project saved. Allow pop-ups to open the preview.', false);
      }
    } catch (error) {
      if (previewWindow) previewWindow.close();
      showMessage(error.message);
    } finally { buttons.forEach((button) => { button.disabled = false; }); }
  }

  document.querySelector('#saveDraft').addEventListener('click', () => save('draft'));
  document.querySelector('#publishProject').addEventListener('click', () => save('published'));
  document.querySelector('#previewProject').addEventListener('click', () => save(editorProject?.status || 'draft', { preview: true }));
}

async function init() {
  if (page === 'login') return initLogin();
  const session = await checkSession();
  if (!session.authenticated) return;
  if (page === 'dashboard') await initDashboard();
  if (page === 'projects') await initProjects();
  if (page === 'editor') await loadEditor();
}

init();
