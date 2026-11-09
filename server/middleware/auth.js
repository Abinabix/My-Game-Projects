export function requireAdmin(req, res, next) {
  if (!req.session?.adminId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

export function requireAdminPage(req, res, next) {
  if (!req.session?.adminId) return res.redirect('/admin/login');
  next();
}
