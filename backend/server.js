require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const security = require('./security');
const { limiter, v } = security;

const app = express();
app.disable('x-powered-by');                       // do not advertise "Express" to attackers

// ---------- security headers ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',           // browser must not guess file types
    'X-Frame-Options': 'SAMEORIGIN',               // other sites cannot embed us in an iframe (clickjacking)
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

// CORS is OFF by default: the website and the API are served from the same origin.
// Only if you run the frontend from another origin (e.g. Live Server), set CORS_ORIGIN=http://127.0.0.1:5500 in .env
if (process.env.CORS_ORIGIN) app.use(require('cors')({ origin: process.env.CORS_ORIGIN.split(',') }));

app.use(express.json({ limit: '20kb' }));          // tiny body limit: nobody needs to POST megabytes here

// ---------- static files: ONLY the website, never backend/, database/, docs/ or README ----------
const FRONTEND_DIR = process.env.FRONTEND_DIR ||
  (fs.existsSync(path.join(__dirname, '..', 'index.html')) ? path.join(__dirname, '..') : path.join(__dirname, '..', 'DBMS PROJECT'));
['css', 'js', 'images'].forEach((d) =>
  app.use('/' + d, express.static(path.join(FRONTEND_DIR, d), { dotfiles: 'ignore', index: false })));
app.get(/^\/([A-Za-z0-9_-]+\.html)?$/, (req, res) => {              // "/" and "/page.html" at the top level only
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  res.sendFile(path.join(FRONTEND_DIR, file), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// ---------- database ----------
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',            // better: create a least-privilege user (see database/07_security.sql)
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'tripnest',
  waitForConnections: true,
  dateStrings: true,
  connectionLimit: 10,
});

const sec = security(db);
const { auth, adminOnly, self, wrap } = sec;

// ---------- AUTH (register / login / logout) ----------
require('./auth-routes')(app, db, wrap, auth, sec);

// ---------- DESTINATIONS / HOTELS / PACKAGES (public, read only) ----------
app.get('/api/destinations', wrap(async (req, res) => {
  const { continent } = req.query;
  const [rows] = continent
    ? await db.query('SELECT * FROM destinations WHERE continent = ?', [String(continent)])
    : await db.query('SELECT * FROM destinations');
  res.json(rows);
}));

app.get('/api/hotels', wrap(async (req, res) => {
  const [rows] = await db.query(
    'SELECT h.*, d.name AS destination FROM hotels h JOIN destinations d ON h.dest_id = d.dest_id');
  res.json(rows);
}));

app.get('/api/hotels/:id', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM hotels WHERE hotel_id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Hotel not found' });
  const [reviews] = await db.query(
    `SELECT r.rating, r.comment, u.full_name FROM reviews r
     JOIN users u ON r.user_id = u.user_id WHERE r.hotel_id = ?`, [req.params.id]);
  res.json({ ...rows[0], reviews });
}));

app.get('/api/packages', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, GROUP_CONCAT(pi.item) AS includes
     FROM packages p LEFT JOIN package_includes pi ON p.package_id = pi.package_id
     GROUP BY p.package_id`);
  res.json(rows.map((p) => ({ ...p, includes: p.includes ? p.includes.split(',') : [] })));
}));

// ---------- TRIPS (plan-trip page) ----------
// The trip always belongs to the LOGGED-IN user (taken from the token, never from the request body).
// Destination / hotel must already exist: visitors can no longer create junk rows in the catalog.
app.post('/api/plan-trip', auth, wrap(async (req, res) => {
  const { destination, hotel, package_tier, travelers, budget, start_date, end_date } = req.body;
  if (!destination || !v.isDate(start_date) || !v.isDate(end_date) || end_date < start_date)
    return res.status(400).json({ error: 'A destination and valid dates (end date after start date) are required' });

  const destName = v.clean(String(destination).split(',')[0], 80);          // "Santorini, Greece" -> "Santorini"
  const [d] = await db.query('SELECT dest_id FROM destinations WHERE name = ?', [destName]);
  if (!d.length) return res.status(404).json({ error: 'Unknown destination' });

  let hotelId = null;
  if (hotel) {
    const [h] = await db.query('SELECT hotel_id FROM hotels WHERE name = ?', [v.clean(hotel, 120)]);
    if (h.length) hotelId = h[0].hotel_id;
  }
  const trav = Math.min(Math.max(parseInt(travelers, 10) || 1, 1), 20);      // "2 travelers" -> 2
  const money = Number(budget);
  const [r] = await db.query(
    `INSERT INTO trips (user_id, dest_id, hotel_id, package_tier, travelers, budget, start_date, end_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.user_id, d[0].dest_id, hotelId, v.clean(package_tier, 30) || null, trav,
     money >= 0 && money < 10000000 ? money : null, start_date, end_date]);
  res.json({ trip_id: r.insertId });
}));

app.get('/api/users/:id/trips', auth, self, wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT t.* FROM v_trip_details t JOIN trips x ON x.trip_id = t.trip_id WHERE x.user_id = ?`,
    [req.params.id]);
  res.json(rows);
}));

// only the owner can delete a trip (the user_id in the WHERE clause is the ownership check)
app.delete('/api/trips/:id', auth, wrap(async (req, res) => {
  const [r] = await db.query('DELETE FROM trips WHERE trip_id = ? AND user_id = ?', [req.params.id, req.user.user_id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Trip not found' });
  res.json({ message: 'Trip deleted' });
}));

// ---------- BOOKINGS: seat-based booking lives in booking-routes.js (POST /api/book, needs login) ----------
app.get('/api/users/:id/bookings', auth, self, wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.booking_id, p.name AS package_name, b.travel_date, b.travelers, b.total_price, b.status,
            CASE WHEN b.status = 'pending' AND b.hold_expires_at IS NOT NULL
                 THEN GREATEST(TIMESTAMPDIFF(MINUTE, NOW(), b.hold_expires_at), 0) END AS hold_minutes_left
     FROM bookings b JOIN packages p ON b.package_id = p.package_id
     WHERE b.user_id = ? ORDER BY b.booked_at DESC`, [req.params.id]);
  res.json(rows);
}));

// ---------- CONTACT (public form, so: validation + rate limit against spam) ----------
const contactLimit = limiter({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => r.ip,
  message: 'Too many messages from this device. Please try again later.' });
app.post('/api/contact', contactLimit, wrap(async (req, res) => {
  const fullname = v.clean(req.body.fullname, 80), email = v.clean(req.body.email, 254);
  const phone = v.clean(req.body.phone, 15), subject = v.clean(req.body.subject, 150), message = v.clean(req.body.message, 2001);
  if (!fullname || !v.isEmail(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  if (phone && !v.isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
  if (message.length < 5 || message.length > 2000) return res.status(400).json({ error: 'Message must be 5 to 2000 characters' });
  await db.query(
    'INSERT INTO contact_messages (full_name, email, phone, subject, message) VALUES (?,?,?,?,?)',
    [fullname, email, phone || null, subject || null, message]);
  res.json({ message: 'Message received' });
}));

// ---------- ADMIN (every route uses adminOnly: valid session AND role = admin in the database) ----------
app.get('/api/admin/stats', adminOnly, wrap(async (req, res) => {
  const [[r]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM trips) AS trips,
            (SELECT COUNT(*) FROM bookings) AS bookings,
            (SELECT COALESCE(SUM(total_price),0) FROM bookings WHERE status <> 'cancelled') AS revenue`);
  res.json(r);
}));
app.get('/api/admin/users', adminOnly, wrap(async (req, res) => {
  const [rows] = await db.query('SELECT user_id, full_name, email, phone, country, role, created_at FROM users ORDER BY user_id DESC');
  res.json(rows);
}));
app.get('/api/admin/trips', adminOnly, wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM v_trip_details ORDER BY trip_id DESC');
  res.json(rows);
}));
app.get('/api/admin/bookings', adminOnly, wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.booking_id, u.full_name, p.name AS package_name, b.travel_date, b.travelers, b.total_price, b.status
     FROM bookings b JOIN users u ON b.user_id = u.user_id JOIN packages p ON b.package_id = p.package_id
     ORDER BY b.booking_id DESC`);
  res.json(rows);
}));
app.get('/api/admin/messages', adminOnly, wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM contact_messages ORDER BY msg_id DESC');
  res.json(rows);
}));

// Admin can only CANCEL. A booking becomes "confirmed" automatically when the customer pays (trigger),
// so an admin can no longer mark an unpaid booking as confirmed. Cancelling goes through sp_cancel_booking,
// so the refund is calculated and the seats are released exactly like a customer cancellation.
app.patch('/api/admin/bookings/:id', adminOnly, wrap(async (req, res) => {
  if (req.body.status !== 'cancelled')
    return res.status(400).json({ error: 'Admins can only cancel a booking. It becomes confirmed automatically when the customer pays.' });
  const id = parseInt(req.params.id, 10);
  const [rows] = await db.query('SELECT user_id FROM bookings WHERE booking_id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
  try {
    const [result] = await db.query('CALL sp_cancel_booking(?,?,?)', [id, rows[0].user_id, 'Cancelled by admin']);
    res.json({ message: 'Cancelled', ...result[0][0] });
  } catch (e) {
    if (e.sqlState === '45000') return res.status(400).json({ error: e.sqlMessage });
    throw e;
  }
}));

require('./extra-routes')(app, db, wrap, auth, adminOnly, limiter);
require('./booking-routes')(app, db, wrap, auth, adminOnly);

// ---------- last line of defence: bad JSON, too-big bodies, anything unexpected ----------
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {                       // eslint-disable-line no-unused-vars
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';            // only this computer can reach the server (set HOST=0.0.0.0 to share on your network)
app.listen(PORT, HOST, () => console.log(`TripNest running at http://localhost:${PORT}`));

// Unpaid bookings are cancelled after 30 minutes by the MySQL event ev_expire_pending_bookings (database/08).
// If the MySQL event scheduler happens to be OFF, this backup timer calls the same procedure every minute.
(async () => {
  try {
    const [[r]] = await db.query("SELECT @@event_scheduler AS s, (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE() AND routine_name = 'sp_expire_pending_bookings') AS has_proc");
    if (!r.has_proc) return console.warn('Run database/08_hold_expiry_and_ratings.sql to enable the 30 minute booking hold expiry.');
    if (String(r.s).toUpperCase() === 'ON') return console.log('Booking hold expiry: handled by the MySQL event scheduler');
    console.warn('MySQL event scheduler is OFF: expiring unpaid bookings from Node every minute instead (or run: SET GLOBAL event_scheduler = ON;)');
    setInterval(() => db.query('CALL sp_expire_pending_bookings()').catch((e) => console.error('expiry job failed:', e.message)), 60 * 1000);
  } catch (e) { console.error('expiry check failed:', e.message); }
})();
