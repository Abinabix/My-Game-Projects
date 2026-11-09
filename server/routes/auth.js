import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { query } from '../db.js';

const router = Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and try again.' },
});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || !password || password.length > 1024) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const { rows } = await query('SELECT id, email, password_hash FROM admin_users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    const user = rows[0];
    const valid = user && await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.adminId = user.id;
    req.session.adminEmail = user.email;
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ authenticated: true, email: user.email });
  } catch (error) { next(error); }
});

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ authenticated: false });
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('abin.sid', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
    res.json({ authenticated: false });
  });
});

router.get('/session', (req, res) => {
  res.json(req.session?.adminId
    ? { authenticated: true, email: req.session.adminEmail }
    : { authenticated: false });
});

export default router;
