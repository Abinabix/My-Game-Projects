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
