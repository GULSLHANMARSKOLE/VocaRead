// backend/middleware/requireAuth.js
export default function requireAuth(req, res, next) {
  if (req.session?.userId) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized: please log in." });
}
