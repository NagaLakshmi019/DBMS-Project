require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Frontend folder ni ee server nunchi serve chestam (same origin => CORS problem undadu)
// backend folder ni "DBMS PROJECT" folder pakkane pettandi
const fs = require('fs');
// backend folder frontend pakkana unna leda frontend lopala unna rendu cases support chestundi
const FRONTEND_DIR = process.env.FRONTEND_DIR ||
  (fs.existsSync(path.join(__dirname, '..', 'index.html')) ? path.join(__dirname, '..') : path.join(__dirname, '..', 'DBMS PROJECT'));
app.use(express.static(FRONTEND_DIR));

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_PASS,
  waitForConnections: true,
  dateStrings: true, // DATE columns 'YYYY-MM-DD' strings ga vastayi (timezone valla 1 roju taggakunda)
  connectionLimit: 10
});

// async errors ni handle cheyadaniki wrapper
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  });

// ---------- SESSION TOKENS + ROLES (server restart ayite login malli cheyali) ----------
const crypto = require('crypto');
const tokens = new Map();
const session = (u) => {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { user_id: u.user_id, role: u.role || 'customer' });
  return { user_id: u.user_id, name: u.full_name, role: u.role || 'customer', token };
};
const auth = (req, res, next) => {
  const u = tokens.get(req.headers['x-auth-token']);
  if (!u) return res.status(401).json({ error: 'Please login' });
  req.user = u; next();
};
const adminOnly = (req, res, next) =>
  auth(req, res, () => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' })));

// ---------- AUTH ----------
app.post('/api/register', wrap(async (req, res) => {
  const { fullname, email, phone, country, password } = req.body;
  if (!fullname || !email || !password || password.length < 8)
    return res.status(400).json({ error: 'Invalid input' });
  const [exists] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (exists.length) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await db.query(
    'INSERT INTO users (full_name, email, phone, country, password_hash) VALUES (?,?,?,?,?)',
    [fullname, email, phone || null, country || null, hash]
  );
  res.json(session({ user_id: r.insertId, full_name: fullname, role: 'customer' }));
}));

app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json(session(rows[0]));
}));

// ---------- DESTINATIONS / HOTELS / PACKAGES ----------
app.get('/api/destinations', wrap(async (req, res) => {
  const { continent } = req.query;
  const [rows] = continent
    ? await db.query('SELECT * FROM destinations WHERE continent = ?', [continent])
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
// plan-trip.html nunchi: frontend cards lo ids ledu, names untayi => name tho find-or-create chestam
app.post('/api/plan-trip', wrap(async (req, res) => {
  const { user_id, destination, hotel, hotel_price, package_tier, travelers, budget, start_date, end_date } = req.body;
  if (!user_id || !destination || !start_date || !end_date)
    return res.status(400).json({ error: 'Destination and dates are required' });

  // "Santorini, Greece" => name + country
  const [destName, ...rest] = destination.split(',').map((x) => x.trim());
  const country = rest.join(', ') || 'Unknown';
  let [d] = await db.query('SELECT dest_id FROM destinations WHERE name = ?', [destName]);
  let destId = d.length ? d[0].dest_id
    : (await db.query('INSERT INTO destinations (name, country) VALUES (?,?)', [destName, country]))[0].insertId;

  let hotelId = null;
  if (hotel) {
    const [h] = await db.query('SELECT hotel_id FROM hotels WHERE name = ?', [hotel]);
    if (h.length) hotelId = h[0].hotel_id;
    else {
      const price = parseFloat(String(hotel_price || '').replace(/[^0-9.]/g, '')) || 0;
      hotelId = (await db.query(
        'INSERT INTO hotels (dest_id, name, price_per_night) VALUES (?,?,?)', [destId, hotel, price]))[0].insertId;
    }
  }

  const trav = parseInt(travelers, 10) || 1; // "2 travelers" => 2
  const [r] = await db.query(
    `INSERT INTO trips (user_id, dest_id, hotel_id, package_tier, travelers, budget, start_date, end_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [user_id, destId, hotelId, package_tier || null, trav, budget || null, start_date, end_date]);
  res.json({ trip_id: r.insertId });
}));

app.get('/api/users/:id/trips', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT t.* FROM v_trip_details t JOIN trips x ON x.trip_id = t.trip_id WHERE x.user_id = ?`,
    [req.params.id]);
  res.json(rows);
}));

app.delete('/api/trips/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM trips WHERE trip_id = ?', [req.params.id]);
  res.json({ message: 'Trip deleted' });
}));

// ---------- BOOKINGS (packages page) ----------
app.post('/api/bookings', wrap(async (req, res) => {
  const { user_id, package_id, travel_date, travelers } = req.body;
  const [result] = await db.query('CALL sp_book_package(?,?,?,?)', [user_id, package_id, travel_date, travelers || 1]);
  res.json(result[0][0]);
}));

// packages.html booking modal: package name matrame untundi
app.post('/api/book-by-name', wrap(async (req, res) => {
  const { user_id, package_name, travel_date, travelers } = req.body;
  const [p] = await db.query('SELECT package_id FROM packages WHERE name = ?', [package_name]);
  if (!p.length) return res.status(404).json({ error: 'Package not found' });
  const [result] = await db.query('CALL sp_book_package(?,?,?,?)', [user_id, p[0].package_id, travel_date, travelers || 1]);
  res.json(result[0][0]);
}));

// ---------- REVIEWS / WISHLIST / CONTACT ----------
app.post('/api/reviews', wrap(async (req, res) => {
  const { user_id, hotel_id, rating, comment } = req.body;
  await db.query('INSERT INTO reviews (user_id, hotel_id, rating, comment) VALUES (?,?,?,?)',
    [user_id, hotel_id, rating, comment]);
  res.json({ message: 'Review added' });
}));

app.post('/api/wishlist', wrap(async (req, res) => {
  const { user_id, dest_id } = req.body;
  await db.query('INSERT IGNORE INTO wishlist (user_id, dest_id) VALUES (?,?)', [user_id, dest_id]);
  res.json({ message: 'Added to wishlist' });
}));

app.post('/api/contact', wrap(async (req, res) => {
  const { fullname, email, phone, subject, message } = req.body;
  await db.query(
    'INSERT INTO contact_messages (full_name, email, phone, subject, message) VALUES (?,?,?,?,?)',
    [fullname, email, phone || null, subject || null, message]);
  res.json({ message: 'Message received' });
}));

// ---------- USER BOOKINGS (my-trips.html) ----------
app.get('/api/users/:id/bookings', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.booking_id, p.name AS package_name, b.travel_date, b.travelers, b.total_price, b.status
     FROM bookings b JOIN packages p ON b.package_id = p.package_id
     WHERE b.user_id = ? ORDER BY b.booked_at DESC`, [req.params.id]);
  res.json(rows);
}));

// ---------- ADMIN (x-admin-key header tho protected; default key: admin123) ----------
app.get('/api/admin/stats', adminOnly, wrap(async (req, res) => {
  const [[r]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM trips) AS trips,
            (SELECT COUNT(*) FROM bookings) AS bookings,
            (SELECT COALESCE(SUM(total_price),0) FROM bookings WHERE status <> 'cancelled') AS revenue`);
  res.json(r);
}));
app.get('/api/admin/users', adminOnly, wrap(async (req, res) => {
  const [rows] = await db.query('SELECT user_id, full_name, email, phone, country, created_at FROM users ORDER BY user_id DESC');
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
app.patch('/api/admin/bookings/:id', adminOnly, wrap(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.query('UPDATE bookings SET status = ? WHERE booking_id = ?', [status, req.params.id]);
  res.json({ message: 'Updated' });
}));

   require('./extra-routes')(app, db, wrap, auth, adminOnly, session);

app.listen(3000, () => console.log('TripNest running at http://localhost:3000'));
