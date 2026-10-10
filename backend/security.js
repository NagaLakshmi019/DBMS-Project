// TripNest - security helpers: DB sessions, auth middleware, rate limiting, validation, safe errors.
const crypto = require('crypto');

const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- validation helpers ----------
const isEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isPhone = (p) => /^[0-9+()\-\s]{7,15}$/.test(p);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const safeEqual = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

// ---------- rate limiting (in memory, no extra package) ----------
// Counts every request per key inside a time window. Too many -> HTTP 429.
function limiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = keyFn(req), now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    if (++h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Counts only FAILED logins per (ip + email). After `max` failures the account is locked for the window.
function failTracker({ max, windowMs }) {
  const fails = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.reset < now) fails.delete(k); }, windowMs).unref();
  return {
    lockedFor(key) {                       // seconds left if locked, else 0
      const f = fails.get(key);
      return f && f.reset > Date.now() && f.count >= max ? Math.ceil((f.reset - Date.now()) / 1000) : 0;
    },
    add(key) {
      const now = Date.now();
      let f = fails.get(key);
      if (!f || f.reset < now) { f = { count: 0, reset: now + windowMs }; fails.set(key, f); }
      f.count++;
    },
    clear(key) { fails.delete(key); },
  };
}

module.exports = (db) => {
  // ---------- sessions (table: sessions, see database/07_security.sql) ----------
  async function createSession(u) {
    const token = crypto.randomBytes(32).toString('hex');     // 64 hex chars, unguessable
    await db.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
      [sha256(token), u.user_id, SESSION_HOURS]);
    return { user_id: u.user_id, name: u.full_name, role: u.role || 'customer', token };
  }
  const destroySession = (token) => db.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);

  // delete expired sessions every 10 minutes
  setInterval(() => db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {}), 10 * 60 * 1000).unref();

  // ---------- middleware ----------
  // Token must exist in sessions and not be expired. Role is read from the users table on EVERY request,
  // so if an admin is demoted the change applies immediately.
  const auth = async (req, res, next) => {
    try {
      const t = req.headers['x-auth-token'];
      if (typeof t !== 'string' || t.length !== 64) return res.status(401).json({ error: 'Please login' });
      const [rows] = await db.query(
        `SELECT s.user_id, u.role FROM sessions s JOIN users u ON u.user_id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW()`, [sha256(t)]);
      if (!rows.length) return res.status(401).json({ error: 'Please login' });
      req.user = { user_id: rows[0].user_id, role: rows[0].role };
      req.token = t;
      next();
    } catch (e) { console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  };
  const adminOnly = (req, res, next) =>
    auth(req, res, () => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' })));
  // /api/users/:id/...  -> only that user (or an admin)
  const self = (req, res, next) =>
    String(req.params.id) === String(req.user.user_id) || req.user.role === 'admin'
      ? next() : res.status(403).json({ error: 'You can only access your own data' });

  // ---------- safe async wrapper: real error goes to the server log, the browser gets a clean message ----------
  const wrap = (fn) => (req, res) =>
    fn(req, res).catch((err) => {
      console.error(err);
      if (err.sqlState === '45000') return res.status(409).json({ error: err.sqlMessage }); // our own SIGNAL messages
      if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'Related record not found' });
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That record already exists' });
      if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This item is linked to a booking, so it cannot be deleted' });
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'That value is not allowed' });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    });

  return { auth, adminOnly, self, wrap, createSession, destroySession };
};

module.exports.limiter = limiter;
module.exports.failTracker = failTracker;
module.exports.v = { isEmail, isPhone, isDate, clean, safeEqual };
