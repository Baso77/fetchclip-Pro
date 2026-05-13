function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { adminAuth };
