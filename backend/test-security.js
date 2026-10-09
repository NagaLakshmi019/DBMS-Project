// TripNest - security test (viva demo). Attacks the RUNNING server the way a hacker would and prints PASS / FAIL.
// Start the server first (node server.js), then in another terminal:
//   cd backend && node test-security.js
// It creates temporary users (sectest-*@tripnest.local) and removes them at the end.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASS = 'Passw0rd!123';
const results = [];
const check = (group, name, ok, detail = '') => results.push({ group, name, ok, detail });

async function http(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'x-auth-token': token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, json, text };
}

(async () => {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'tripnest', dateStrings: true, connectionLimit: 5,
  });
  const ts = Date.now();
  const mail = (n) => `sectest-${n}-${ts}@tripnest.local`;
  const reg = (n, extra = {}) => http('POST', '/api/auth/register', { body: { fullname: 'Sec Tester ' + n, email: mail(n), password: PASS, ...extra } });

  // ---------- setup: two normal users (+ an admin if ADMIN_CODE is set) ----------
  const A = (await reg('a')).json, B = (await reg('b')).json;
  if (!A || !A.token || !B || !B.token) { console.error('Could not register test users. Is the server running at ' + BASE + ' ?'); process.exit(2); }
  let C = null;
  if (process.env.ADMIN_CODE) {
    const r = await reg('c', { role: 'admin', admin_code: process.env.ADMIN_CODE });
    C = r.json && r.json.token ? r.json : null;
  }

  const tripBody = { user_id: A.user_id, destination: 'Santorini, Greece', hotel: 'Azure Cliff Resort', package_tier: 'Explorer', travelers: '2 travelers', budget: 3000, start_date: '2027-01-10', end_date: '2027-01-15' };

  // ---------- 1. Broken access control (IDOR) ----------
  const G1 = '1. Users must not touch each other\'s data';
  check(G1, 'plan-trip without login is rejected', (await http('POST', '/api/plan-trip', { body: tripBody })).status === 401);
  await http('POST', '/api/plan-trip', { token: A.token, body: tripBody });
  let r = await http('GET', `/api/users/${A.user_id}/trips`);
  check(G1, 'reading trips without login is rejected (401)', r.status === 401, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/trips`, { token: B.token });
  check(G1, 'user B cannot read user A\'s trips (403)', r.status === 403, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/bookings`);
  check(G1, 'reading bookings without login is rejected (401)', r.status === 401, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/bookings`, { token: B.token });
  check(G1, 'user B cannot read user A\'s bookings (403)', r.status === 403, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token });
  check(G1, 'user A can read own trips', r.status === 200 && Array.isArray(r.json) && r.json.length === 1, 'got ' + r.status);
  const tripId = r.json && r.json[0] && r.json[0].trip_id;

  // B logged in but puts A's id in the body: the trip must still belong to B
  await http('POST', '/api/plan-trip', { token: B.token, body: tripBody });
  const bTrips = await http('GET', `/api/users/${B.user_id}/trips`, { token: B.token });
  const aTrips = await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token });
  check(G1, 'user_id in the request body is ignored (trip is saved for the logged-in user)',
    Array.isArray(bTrips.json) && bTrips.json.length === 1 && aTrips.json.length === 1, `B has ${bTrips.json && bTrips.json.length}, A has ${aTrips.json && aTrips.json.length}`);

  r = await http('DELETE', `/api/trips/${tripId}`);
  check(G1, 'deleting a trip without login is rejected (401)', r.status === 401, 'got ' + r.status);
  r = await http('DELETE', `/api/trips/${tripId}`, { token: B.token });
  check(G1, 'user B cannot delete user A\'s trip', r.status === 404 || r.status === 403, 'got ' + r.status);
  const still = await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token });
  check(G1, 'A\'s trip still exists after B\'s delete attempt', Array.isArray(still.json) && still.json.length === 1);

  // ---------- 2. Old unprotected routes ----------
  const G2 = '2. Old unprotected routes are gone';
  for (const [m, p] of [['POST', '/api/reviews'], ['POST', '/api/wishlist'], ['POST', '/api/register'], ['POST', '/api/login']]) {
    r = await http(m, p, { body: {} });
    check(G2, `${m} ${p} no longer exists`, r.status === 404, 'got ' + r.status);
  }

  // ---------- 3. Source code / SQL exposure ----------
  const G3 = '3. Server only serves website files';
  for (const p of ['/backend/server.js', '/backend/package.json', '/backend/.env', '/database/01_schema.sql', '/database/06_seat_availability.sql', '/README.md']) {
    r = await http('GET', p);
    check(G3, `GET ${p} is blocked`, r.status === 404, 'got ' + r.status);
  }
  for (const p of ['/index.html', '/packages.html', '/css/packages.css', '/js/api.js']) {
    r = await http('GET', p);
    check(G3, `GET ${p} still works`, r.status === 200, 'got ' + r.status);
  }

  // ---------- 4. Sessions ----------
  const G4 = '4. Login sessions';
  const A2 = (await http('POST', '/api/auth/login', { body: { email: mail('a'), password: PASS, as: 'customer' } })).json;
  r = await http('POST', '/api/auth/logout', { token: A2.token });
  check(G4, 'logout works', r.status === 200, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/trips`, { token: A2.token });
  check(G4, 'token is dead after logout (401)', r.status === 401, 'got ' + r.status);
  let expiredOk = false;
  try {
    await db.query('UPDATE sessions SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE user_id = ?', [B.user_id]);
    r = await http('GET', `/api/users/${B.user_id}/trips`, { token: B.token });
    expiredOk = r.status === 401;
  } catch (e) { /* no sessions table */ }
  check(G4, 'expired token is rejected (sessions table with expiry)', expiredOk);
  const B2 = (await http('POST', '/api/auth/login', { body: { email: mail('b'), password: PASS, as: 'customer' } })).json;
  Object.assign(B, B2);

  // ---------- 5. Roles ----------
  const G5 = '5. Roles';
  check(G5, 'customer cannot open admin API (403)', (await http('GET', '/api/admin/users', { token: A.token })).status === 403);
  check(G5, 'no token cannot open admin API (401)', (await http('GET', '/api/admin/users')).status === 401);
  check(G5, 'role cannot be forced by the register body (role=admin without code)',
    (await http('POST', '/api/auth/register', { body: { fullname: 'Hacker', email: mail('h'), password: PASS, role: 'admin', admin_code: 'guess' } })).status === 403);

  // ---------- 6. Brute force ----------
  const G6 = '6. Brute-force protection';
  const victim = mail('victim');
  const statuses = [];
  for (let i = 0; i < 8; i++) statuses.push((await http('POST', '/api/auth/login', { body: { email: victim, password: 'wrong-pass-' + i } })).status);
  check(G6, 'repeated wrong passwords get locked out (429)', statuses.includes(429), 'statuses: ' + statuses.join(','));

  // ---------- 7. Bookings, payments, admin ----------
  const G7 = '7. Money and booking integrity';
  const deps = (await http('GET', '/api/departures?package_name=' + encodeURIComponent('Santorini Sunset Escape'))).json || [];
  const dep = deps.find((d) => d.seats_left >= 4);
  if (!dep) {
    check(G7, 'needs a departure with 4+ seats (run 06_seat_availability.sql)', false);
  } else {
    // double payment race: 5 simultaneous pay clicks on one booking
    const bk = (await http('POST', '/api/book', { token: A.token, body: { departure_id: dep.departure_id, travelers: 1 } })).json;
    const pays = await Promise.all(Array.from({ length: 5 }, () => http('POST', '/api/pay', { token: A.token, body: { booking_id: bk.booking_id, method: 'card' } })));
    const [[pc]] = await db.query('SELECT COUNT(*) n FROM payments WHERE booking_id = ?', [bk.booking_id]);
    check(G7, '5 simultaneous pay requests create exactly 1 payment', pc.n === 1 && pays.filter((p) => p.status === 200).length === 1,
      `payments in DB: ${pc.n}, successful responses: ${pays.filter((p) => p.status === 200).length}`);

    if (C) {
      // admin must not mark an unpaid booking as confirmed
      const bk2 = (await http('POST', '/api/book', { token: A.token, body: { departure_id: dep.departure_id, travelers: 1 } })).json;
      r = await http('PATCH', `/api/admin/bookings/${bk2.booking_id}`, { token: C.token, body: { status: 'confirmed' } });
      check(G7, 'admin cannot confirm a booking that was never paid', r.status >= 400 && r.status < 500, 'got ' + r.status);
      // admin cancelling a PAID booking must create a refund (goes through sp_cancel_booking)
      r = await http('PATCH', `/api/admin/bookings/${bk.booking_id}`, { token: C.token, body: { status: 'cancelled' } });
      const [[rf]] = await db.query('SELECT COUNT(*) n FROM refunds WHERE booking_id = ?', [bk.booking_id]);
      check(G7, 'admin cancel of a paid booking creates a refund', r.status === 200 && rf.n === 1, `status ${r.status}, refunds: ${rf.n}`);
      r = await http('PATCH', `/api/admin/bookings/${bk2.booking_id}`, { token: C.token, body: { status: 'cancelled' } });
      check(G7, 'admin cancel of an unpaid booking works', r.status === 200, 'got ' + r.status);
    } else {
      check(G7, 'admin booking checks (set ADMIN_CODE in .env to run them)', false, 'skipped');
    }
  }

  // ---------- 8. Input handling ----------
  const G8 = '8. Input handling';
  r = await http('POST', '/api/hotels/999999/reviews', { token: A.token, body: { rating: 5, comment: 'x' } });
  check(G8, 'unknown hotel gives a clean 404 (no raw SQL error)', r.status === 404 && !/constraint|sql|foreign/i.test(r.text), `got ${r.status}: ${r.text.slice(0, 80)}`);
  r = await http('POST', '/api/auth/register', { body: { fullname: 'X', email: 'not-an-email', password: PASS } });
  check(G8, 'invalid email is rejected on the server', r.status === 400, 'got ' + r.status);
  r = await http('POST', '/api/auth/register', { body: { fullname: 'Long Pass', email: mail('lp'), password: 'a'.repeat(200) } });
  check(G8, 'password longer than 72 chars is rejected (bcrypt limit)', r.status === 400, 'got ' + r.status);
  r = await http('POST', '/api/plan-trip', { token: A.token, body: { ...tripBody, destination: 'Fake Place <script>, Nowhere' } });
  check(G8, 'plan-trip cannot create junk destinations', r.status === 400 || r.status === 404, 'got ' + r.status);
  const contact = (msg) => http('POST', '/api/contact', { body: { fullname: 'Sec Tester', email: mail('ct'), subject: 'test', message: msg } });
  r = await contact('x'.repeat(5000));
  check(G8, 'oversized contact message is rejected', r.status === 400 || r.status === 413 || r.status === 429, 'got ' + r.status);
  const cs = []; for (let i = 0; i < 12; i++) cs.push((await contact('hello ' + i)).status);
  check(G8, 'contact form spam gets rate-limited (429)', cs.includes(429), 'statuses: ' + cs.join(','));

  // ---------- cleanup ----------
  try {
    const [us] = await db.query("SELECT user_id FROM users WHERE email LIKE 'sectest-%@tripnest.local'");
    const ids = us.map((u) => u.user_id);
    if (ids.length) {
      await db.query("UPDATE bookings SET status = 'cancelled' WHERE user_id IN (?)", [ids]); // trigger gives the seats back
      await db.query('DELETE FROM refunds WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id IN (?))', [ids]);
      await db.query('DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id IN (?))', [ids]);
      for (const t of ['bookings', 'trips', 'reviews', 'wishlist', 'email_log']) await db.query(`DELETE FROM ${t} WHERE user_id IN (?)`, [ids]);
      try { await db.query('DELETE FROM sessions WHERE user_id IN (?)', [ids]); } catch (e) { /* no sessions table yet */ }
      await db.query('DELETE FROM users WHERE user_id IN (?)', [ids]);
    }
    await db.query("DELETE FROM contact_messages WHERE email LIKE 'sectest-%@tripnest.local'");
  } catch (e) { console.log('(cleanup warning: ' + e.message + ')'); }
  await db.end();

  // ---------- report ----------
  let group = '';
  for (const x of results) {
    if (x.group !== group) { group = x.group; console.log('\n' + group); }
    console.log('  ' + (x.ok ? 'PASS' : 'FAIL') + '  ' + x.name + (x.ok || !x.detail ? '' : '   <- ' + x.detail));
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed` + (failed ? `, ${failed} FAILED` : ' - all secure'));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
