import { gsap } from 'gsap';
import './style.css';

// Small interface motion
gsap.from('.hero-copy > *', { y: 22, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', delay: 0.15 });
gsap.from('.hero-art', { opacity: 0, scale: 0.94, duration: 1.4, ease: 'power2.out', delay: 0.3 });

const nav = document.querySelector('#nav');
document.querySelector('#menuToggle').addEventListener('click', () => nav.classList.toggle('open'));
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => nav.classList.remove('open')));

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...nav.querySelectorAll('a')];
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
  });
}, { threshold: 0.35 });
sections.forEach((section) => observer.observe(section));

let time = 0;
function coordinateLoop() {
  time += 0.012;
  document.querySelector('#coordX').textContent = (124.5 + Math.sin(time) * 2.8).toFixed(2);
  document.querySelector('#coordY').textContent = (87.2 + Math.cos(time * 0.7) * 1.9).toFixed(2);
  document.querySelector('#coordZ').textContent = (32 + Math.sin(time * 0.5) * 0.7).toFixed(2);
  requestAnimationFrame(coordinateLoop);
}
coordinateLoop();

// The archive keeps its original card markup and styles; only its content is loaded from the CMS.
const archive = document.querySelector('#projectArchive');
const cardTemplate = document.querySelector('#projectCardTemplate');

function displayValue(value, fallback = '—') {
  if (Array.isArray(value)) return value.filter(Boolean).join(' · ') || fallback;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function renderProjectHeading(element, title, breakAfter) {
  const heading = title.toUpperCase();
  const hint = typeof breakAfter === 'string' ? breakAfter.trim().toUpperCase() : '';
  const match = hint ? heading.indexOf(hint) : -1;
  const breakAt = match < 0 ? -1 : match + hint.length;
  if (breakAt > 0 && breakAt < heading.length && heading[breakAt] === ' ') {
    const lineBreak = document.createElement('br');
    element.replaceChildren(document.createTextNode(heading.slice(0, breakAt)), lineBreak, document.createTextNode(heading.slice(breakAt + 1)));
  } else {
    element.textContent = heading;
  }
}

async function loadProjectArchive() {
  if (!archive || !cardTemplate) return;
  try {
    const response = await fetch('/api/projects', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Project API returned ${response.status}`);
    const projects = await response.json();
    const fragment = document.createDocumentFragment();

    projects.forEach((project, index) => {
      const card = cardTemplate.content.firstElementChild.cloneNode(true);
      const visual = card.querySelector('.project-visual');
      const title = displayValue(project.title, 'UNTITLED PROJECT');
      card.classList.toggle('reverse', index % 2 === 1);
      card.querySelector('[data-project-index]').textContent = `PROJECT_${String(index + 1).padStart(3, '0')}`;
      card.querySelector('[data-project-category]').textContent = displayValue(project.category, 'PROJECT').toUpperCase();
      renderProjectHeading(card.querySelector('[data-project-title]'), title, project.title_break_after);
      card.querySelector('[data-project-summary]').textContent = displayValue(project.short_description, '');
      card.querySelector('[data-project-engine]').textContent = displayValue(project.engine).toUpperCase();
      card.querySelector('[data-project-role]').textContent = displayValue(project.role).toUpperCase();
      card.querySelector('[data-project-technologies]').textContent = displayValue(project.technologies).toUpperCase();
      card.querySelector('[data-project-status]').textContent = displayValue(project.project_status, project.status === 'published' ? 'PUBLISHED' : 'DRAFT').toUpperCase();

      const detail = card.querySelector('[data-project-detail]');
      detail.href = `/projects/${encodeURIComponent(project.slug)}`;
      detail.firstChild.textContent = 'VIEW PROJECT ';

      const github = card.querySelector('[data-project-github]');
      if (project.github_url) {
        github.href = project.github_url;
        github.hidden = false;
      }

      if (index % 2 === 1) {
        visual.classList.replace('visual-environment', 'visual-industrial');
      }
      const stamp = visual.querySelector(index % 2 === 1 ? '.visual-fallback-industrial .visual-stamp' : '.visual-fallback-environment .visual-stamp');
      stamp.textContent = displayValue(project.visual_label, `${displayValue(project.category, 'PROJECT')} / ${String(index + 1).padStart(2, '0')}`).toUpperCase();

      if (project.cover_image) {
        const image = document.createElement('img');
        image.className = 'project-cover';
        image.src = project.cover_image;
        image.alt = project.cover_alt_text || `${title} cover image`;
        image.loading = 'lazy';
        visual.classList.add('has-cover');
        visual.prepend(image);
      }
      fragment.append(card);
    });

    archive.replaceChildren(fragment);
    archive.setAttribute('aria-busy', 'false');
  } catch (error) {
    // Leave the rest of the portfolio fully usable if the API or database is offline.
    archive.setAttribute('aria-busy', 'false');
    const message = document.createElement('p');
    message.className = 'archive-load-error';
    message.textContent = 'PROJECT ARCHIVE TEMPORARILY UNAVAILABLE. PLEASE CHECK BACK SOON.';
    archive.replaceChildren(message);
    console.warn('Unable to load the project archive:', error);
  }
}

loadProjectArchive();
