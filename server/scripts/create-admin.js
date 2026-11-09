import { emitKeypressEvents } from 'node:readline';
import bcrypt from 'bcrypt';
import { checkDatabaseConnection, pool, query, safeDatabaseError } from '../db.js';
import { runMigrations } from './migrate.js';

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return resolve(null);

    let value = '';
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.setRawMode(false);
      input.off('keypress', onKeypress);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        const error = new Error('Administrator setup cancelled.');
        error.exitCode = 130;
        finish(error);
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish();
        return;
      }
      if (key.name === 'backspace') {
        if (value.length) {
          value = [...value].slice(0, -1).join('');
          process.stdout.write('\b \b');
        }
        return;
      }
      if (!key.ctrl && !key.meta && character) {
        value += character;
        process.stdout.write(hidden ? '*' : character);
      }
    };
    input.on('keypress', onKeypress);
  });
}

function isDatabaseError(error) {
  return error?.name === 'DatabaseConfigurationError'
    || error?.code === 'DB_CONFIG'
    || /^[0-9A-Z]{5}$/.test(error?.code || '')
    || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error?.code);
}

try {
  await checkDatabaseConnection();
  console.info('Database connected successfully.');

  await runMigrations();
  const schema = await query("SELECT to_regclass('admin_users') AS admin_table");
  if (!schema.rows[0]?.admin_table) throw new Error('Database schema verification failed: admin_users table is missing after migrations.');
  console.info('Database schema verified.');

  const configuredEmail = process.env.ADMIN_EMAIL?.trim() || '';
  const usableDefault = configuredEmail.toLowerCase() === 'admin@example.com' ? '' : configuredEmail;
  const typedEmail = await prompt(usableDefault ? `Administrator email [${usableDefault}]: ` : 'Administrator email: ');
  const email = (typedEmail?.trim() || usableDefault).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid administrator email. Set ADMIN_EMAIL in .env or run this command in an interactive terminal.');
  }

  const existing = await query('SELECT id FROM admin_users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  if (existing.rowCount) {
    const confirmation = await prompt(`An admin account for ${email} exists. Type RESET to update its password: `);
    if (confirmation !== 'RESET') {
      console.info('No changes made. To recover access, rerun this command and type RESET at the confirmation prompt.');
      process.exitCode = 0;
    } else {
      const password = await prompt('New administrator password (12+ characters, hidden): ', { hidden: true });
      if (!password || password.length < 12) throw new Error('Use a password with at least 12 characters.');
      const confirmationPassword = await prompt('Confirm new password (hidden): ', { hidden: true });
      if (password !== confirmationPassword) throw new Error('Passwords did not match.');
      const hash = await bcrypt.hash(password, 12);
      await query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, existing.rows[0].id]);
      console.info('Administrator password updated successfully.');
      console.info('You can now log in to your admin dashboard.');
    }
  } else {
    const password = await prompt('Administrator password (12+ characters, hidden): ', { hidden: true });
    if (!password || password.length < 12) throw new Error('Use a password with at least 12 characters.');
    const confirmationPassword = await prompt('Confirm password (hidden): ', { hidden: true });
    if (password !== confirmationPassword) throw new Error('Passwords did not match.');
    const hash = await bcrypt.hash(password, 12);
    await query('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [email, hash]);
    console.info('Administrator account created successfully.');
    console.info('You can now log in to your admin dashboard.');
  }
} catch (error) {
  if (error?.exitCode) {
    console.error(error.message);
    process.exitCode = error.exitCode;
  } else if (error?.code === '23505') {
    console.error('An administrator with that email already exists. Rerun and choose RESET to change its password.');
    process.exitCode = 1;
  } else if (isDatabaseError(error)) {
    console.error(safeDatabaseError(error));
    process.exitCode = 1;
  } else {
    console.error(error.message || 'Administrator setup failed.');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
