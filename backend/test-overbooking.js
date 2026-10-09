// TripNest - overbooking test (viva demo).
// 10 people try to book the LAST 3 seats of one departure at exactly the same time.
// Expected: exactly 3 bookings succeed, 7 get "Sold out", seats_booked ends at 3, never more.
//
// Run:  cd backend && node test-overbooking.js
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createPool({
    host: 'localhost', user: 'root', password: process.env.DB_PASS,
    database: 'tripnest', dateStrings: true, connectionLimit: 20
  });

  // temporary test data (removed at the end)
  const [[pkg]] = await db.query('SELECT package_id FROM packages ORDER BY package_id LIMIT 1');
  await db.query(
    `INSERT INTO users (full_name, email, password_hash) VALUES ('Overbooking Test', 'overbooking-test@tripnest.local', 'x')
     ON DUPLICATE KEY UPDATE full_name = full_name`);
  const [[u]] = await db.query("SELECT user_id FROM users WHERE email = 'overbooking-test@tripnest.local'");
  const [dep] = await db.query(
    `INSERT INTO package_departures (package_id, departure_date, seats_total)
     VALUES (?, DATE_ADD(CURDATE(), INTERVAL 700 DAY), 3)`, [pkg.package_id]);
  const depId = dep.insertId;

  console.log('Departure #' + depId + ' has 3 seats. 10 people book 1 seat each at the same moment...\n');

  const attempts = Array.from({ length: 10 }, (_, i) =>
    db.query('CALL sp_book_package(?,?,?)', [u.user_id, depId, 1])
      .then(() => ({ i: i + 1, ok: true }))
      .catch((e) => ({ i: i + 1, ok: false, msg: e.sqlMessage || e.message })));
  const results = await Promise.all(attempts);

  results.forEach((r) => console.log('Person ' + String(r.i).padStart(2), r.ok ? 'BOOKED' : 'REJECTED: ' + r.msg));

  const [[d]] = await db.query('SELECT seats_total, seats_booked, seats_left FROM package_departures WHERE departure_id = ?', [depId]);
  const [[b]] = await db.query("SELECT COUNT(*) n FROM bookings WHERE departure_id = ? AND status <> 'cancelled'", [depId]);
  console.log('\nseats_total =', d.seats_total, '| seats_booked =', d.seats_booked, '| seats_left =', d.seats_left, '| bookings in table =', b.n);

  const ok = results.filter((r) => r.ok).length === 3 && d.seats_booked === 3 && b.n === 3;
  console.log(ok ? '\nPASS: no overbooking' : '\nFAIL: something is wrong');

  // cancel one booking -> trigger must release the seat
  const [[one]] = await db.query("SELECT booking_id FROM bookings WHERE departure_id = ? LIMIT 1", [depId]);
  await db.query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?", [one.booking_id]);
  const [[after]] = await db.query('SELECT seats_left FROM package_departures WHERE departure_id = ?', [depId]);
  console.log('After cancelling 1 booking, seats_left =', after.seats_left, after.seats_left === 1 ? '(PASS: seat released by trigger)' : '(FAIL)');

  // cleanup
  await db.query('DELETE FROM bookings WHERE departure_id = ?', [depId]);
  await db.query('DELETE FROM package_departures WHERE departure_id = ?', [depId]);
  await db.query("DELETE FROM users WHERE email = 'overbooking-test@tripnest.local'");
  await db.end();
  process.exit(ok && after.seats_left === 1 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
