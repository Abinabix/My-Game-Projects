import 'dotenv/config';
import { emitKeypressEvents } from 'node:readline';
import bcrypt from 'bcrypt';
import { pool, query } from '../db.js';
import { runMigrations } from './migrate.js';

function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = '';
    const input = process.stdin;
    if (!input.isTTY) return resolve(null);
    emitKeypressEvents(input);
    input.setRawMode(true);
    const onKey = (character, key) => {
      if (key?.ctrl && key.name === 'c') {
        input.setRawMode(false);
        input.off('keypress', onKey);
        process.stdout.write('\n');
        process.exit(130);
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        input.setRawMode(false);
        input.off('keypress', onKey);
        process.stdout.write('\n');
        resolve(value);
      } else if (key?.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (!key?.ctrl && !key?.meta && character) {
        value += character;
      }
    };
    input.on('keypress', onKey);
  });
}

try {
  await runMigrations();
  const email = (process.env.ADMIN_EMAIL || await prompt('Administrator email: ') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid administrator email address.');
  const password = await prompt('Administrator password (12+ characters, hidden): ');
  if (!password || password.length < 12) throw new Error('Use a password with at least 12 characters.');
  const confirmation = await prompt('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords did not match.');

  const existingAdmin = await query('SELECT id FROM admin_users LIMIT 1');
  if (existingAdmin.rowCount) throw new Error('An administrator already exists. No account was changed.');
  const passwordHash = await bcrypt.hash(password, 12);
  await query('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [email, passwordHash]);
  console.info(`Administrator created for ${email}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
