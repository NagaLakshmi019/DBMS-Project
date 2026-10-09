// TripNest - register / login / logout (customer + admin), with validation and brute-force protection.
const bcrypt = require('bcryptjs');
const { limiter, failTracker, v } = require('./security');

// Admin sign-up needs the invite code from .env. If ADMIN_CODE is not set, admin sign-up is switched off.
const ADMIN_CODE = process.env.ADMIN_CODE || '';
// used when the email does not exist, so "unknown email" and "wrong password" take the same time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

module.exports = (app, db, wrap, auth, sec) => {
  const loginFails = failTracker({ max: 5, windowMs: 15 * 60 * 1000 });          // 5 wrong passwords -> locked 15 min
  const registerLimit = limiter({ windowMs: 15 * 60 * 1000, max: 30, keyFn: (r) => r.ip,
    message: 'Too many sign-up attempts from this device. Please try again later.' });

  app.post('/api/auth/register', registerLimit, wrap(async (req, res) => {
    const fullname = v.clean(req.body.fullname, 60);
    const email = v.clean(req.body.email, 254).toLowerCase();
    const phone = v.clean(req.body.phone, 15);
    const country = v.clean(req.body.country, 60);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (fullname.length < 2) return res.status(400).json({ error: 'Please enter your full name' });
    if (!v.isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (phone && !v.isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8 to 72 characters' });

    const role = req.body.role === 'admin' ? 'admin' : 'customer';
    if (role === 'admin') {
      if (!ADMIN_CODE) return res.status(403).json({ error: 'Admin sign-up is disabled on this server' });
      if (typeof req.body.admin_code !== 'string' || !v.safeEqual(req.body.admin_code, ADMIN_CODE))
        return res.status(403).json({ error: 'Invalid admin invite code' });
    }

    const [ex] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (ex.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [ins] = await db.query(
      'INSERT INTO users (full_name, email, phone, country, password_hash, role) VALUES (?,?,?,?,?,?)',
      [fullname, email, phone || null, country || null, hash, role]);
    res.json(await sec.createSession({ user_id: ins.insertId, full_name: fullname, role }));
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const email = v.clean(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const as = req.body.as;
    const key = req.ip + '|' + email;

    const wait = loginFails.lockedFor(key);
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const ok = await bcrypt.compare(password, rows.length ? rows[0].password_hash : DUMMY_HASH);
    if (!rows.length || !ok) {
      loginFails.add(key);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const isAdmin = rows[0].role === 'admin';
    if (as === 'admin' && !isAdmin) return res.status(403).json({ error: 'This is not an admin account' });
    if (as === 'customer' && isAdmin) return res.status(403).json({ error: 'Admin accounts must sign in from the Admin tab' });
    loginFails.clear(key);
    res.json(await sec.createSession(rows[0]));
  }));

  // logout really kills the session on the server (before, the token stayed valid until restart)
  app.post('/api/auth/logout', auth, wrap(async (req, res) => {
    await sec.destroySession(req.token);
    res.json({ message: 'Logged out' });
  }));
};
