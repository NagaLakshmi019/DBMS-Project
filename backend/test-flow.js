// TripNest - flow test (viva demo): Destination -> Hotels + Packages -> Plan Trip -> My Trips -> Booking.
// Start the server first (node server.js), then:   cd backend && node test-flow.js
// Creates temporary users (flowtest-*@tripnest.local) and removes them at the end.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
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
  const reg = async (n) => (await http('POST', '/api/auth/register', { body: { fullname: 'Flow Tester ' + n, email: `flowtest-${n}-${ts}@tripnest.local`, password: 'Passw0rd!123' } })).json;
  const A = await reg('a'), B = await reg('b');
  if (!A || !A.token) { console.error('Could not register. Is the server running at ' + BASE + ' ?'); process.exit(2); }

  // ---------- 1. The hub: every destination is connected ----------
  const G1 = '1. Destinations are connected to hotels and packages';
  const dests = (await http('GET', '/api/destinations')).json;
  check(G1, 'destinations API returns hotel and package counts', Array.isArray(dests) && dests.every((d) => d.hotels_count !== undefined && d.packages_count !== undefined));
  check(G1, 'every destination has at least one hotel', dests.every((d) => d.hotels_count >= 1), dests.filter((d) => d.hotels_count < 1).map((d) => d.name).join(', '));
  const [[orphan]] = await db.query('SELECT COUNT(*) n FROM packages p LEFT JOIN destinations d ON d.dest_id = p.dest_id WHERE d.dest_id IS NULL');
  check(G1, 'every package belongs to a destination', orphan.n === 0);

  const santorini = dests.find((d) => d.name === 'Santorini'), kyoto = dests.find((d) => d.name === 'Kyoto');
  const optS = (await http('GET', `/api/destinations/${santorini.dest_id}/options`)).json;
  const optK = (await http('GET', `/api/destinations/${kyoto.dest_id}/options`)).json;
  const [[mixed]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM hotels WHERE hotel_id IN (?) AND dest_id <> ?) + (SELECT COUNT(*) FROM packages WHERE package_id IN (?) AND dest_id <> ?) AS n`,
    [optS.hotels.map((h) => h.hotel_id).concat([0]), santorini.dest_id, optS.packages.map((p) => p.package_id).concat([0]), santorini.dest_id]);
  check(G1, 'Santorini options list only Santorini hotels and packages', optS.hotels.length >= 1 && optS.packages.length >= 1 && mixed.n === 0);
  check(G1, 'Kyoto options do not contain Santorini items',
    !optK.hotels.some((h) => optS.hotels.find((x) => x.hotel_id === h.hotel_id)) && !optK.packages.some((p) => optS.packages.find((x) => x.package_id === p.package_id)));

  // ---------- 2. The database itself refuses a mismatch ----------
  const G2 = '2. The database refuses a hotel/package from another destination';
  const sqlErr = async (sql, args) => { try { await db.query(sql, args); return null; } catch (e) { return e.errno; } };
  const kyotoWithSantoriniHotel = await sqlErr(
    "INSERT INTO trips (user_id, dest_id, hotel_id, start_date, end_date) VALUES (?,?,?, '2027-03-01', '2027-03-05')", [A.user_id, kyoto.dest_id, optS.hotels[0].hotel_id]);
  check(G2, 'SQL: Kyoto trip with a Santorini hotel is rejected (error 1452)', kyotoWithSantoriniHotel === 1452, 'errno ' + kyotoWithSantoriniHotel);
  const santoriniWithKyotoPackage = await sqlErr(
    "INSERT INTO trips (user_id, dest_id, package_id, start_date, end_date) VALUES (?,?,?, '2027-03-01', '2027-03-05')", [A.user_id, santorini.dest_id, optK.packages[0].package_id]);
  check(G2, 'SQL: Santorini trip with a Kyoto package is rejected (error 1452)', santoriniWithKyotoPackage === 1452, 'errno ' + santoriniWithKyotoPackage);

  // ---------- 3. Plan trip through the API ----------
  const G3 = '3. Plan Trip';
  const body = (extra) => ({ destination_id: santorini.dest_id, travelers: '2 travelers', budget: 3000, start_date: '2027-03-01', end_date: '2027-03-08', ...extra });
  let r = await http('POST', '/api/plan-trip', { token: A.token, body: body({ hotel_id: optK.hotels[0].hotel_id }) });
  check(G3, 'API rejects a hotel from another destination (400)', r.status === 400, 'got ' + r.status);
  r = await http('POST', '/api/plan-trip', { token: A.token, body: body({ package_id: optK.packages[0].package_id }) });
  check(G3, 'API rejects a package from another destination (400)', r.status === 400, 'got ' + r.status);
  r = await http('POST', '/api/plan-trip', { token: A.token, body: body({ hotel_id: optS.hotels[0].hotel_id, package_id: optS.packages[0].package_id }) });
  check(G3, 'hotel + package of the same destination are accepted', r.status === 200 && r.json.trip_id, 'got ' + r.status);
  const tripId = r.json && r.json.trip_id;
  r = await http('POST', '/api/plan-trip', { token: A.token, body: body({ hotel_id: optS.hotels[0].hotel_id }) });
  const stayOnlyId = r.json && r.json.trip_id;
  check(G3, 'a stay-only trip (no package) is accepted', r.status === 200 && stayOnlyId, 'got ' + r.status);
  r = await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token });
  const mine = (r.json || []).find((t) => t.trip_id === tripId);
  check(G3, 'My Trips shows destination, hotel and package name', mine && mine.destination === 'Santorini' && mine.hotel === optS.hotels[0].name && mine.package_name === optS.packages[0].name, JSON.stringify(mine));

  // ---------- 4. Trip -> booking ----------
  const G4 = '4. My Trips -> Book this trip';
  const deps = (await http('GET', `/api/departures?package_id=${optS.packages[0].package_id}`)).json;
  const dep = deps.find((d) => d.seats_left >= 3);
  const depOther = (await http('GET', `/api/departures?package_id=${optK.packages[0].package_id}`)).json[0];
  const book = (id, departure, token = A.token, travelers = 2) => http('POST', `/api/trips/${id}/book`, { token, body: { departure_id: departure, travelers } });

  r = await book(tripId, depOther.departure_id);
  check(G4, 'a departure of another package cannot be used for this trip (409)', r.status === 409, `got ${r.status}: ${r.json && r.json.error}`);
  r = await book(stayOnlyId, dep.departure_id);
  check(G4, 'a stay-only trip has no package to book (409)', r.status === 409, `got ${r.status}: ${r.json && r.json.error}`);
  r = await book(tripId, dep.departure_id, B.token);
  check(G4, 'another user cannot book my trip (404)', r.status === 404, 'got ' + r.status);
  r = await book(tripId, dep.departure_id);
  const bk = r.json;
  check(G4, 'booking the trip works and holds the seats', r.status === 200 && bk.trip_id === tripId && bk.status === 'pending', `got ${r.status}`);
  r = await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token });
  const after = (r.json || []).find((t) => t.trip_id === tripId);
  check(G4, 'trip now shows the booking and its dates come from the departure',
    after && after.booking_id === bk.booking_id && after.booking_status === 'pending' && after.start_date === dep.departure_date, JSON.stringify(after));
  r = await book(tripId, dep.departure_id);
  check(G4, 'the same trip cannot be booked twice (409)', r.status === 409, `got ${r.status}: ${r.json && r.json.error}`);

  r = await http('POST', '/api/pay', { token: A.token, body: { booking_id: bk.booking_id, method: 'card' } });
  const paid = (await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token })).json.find((t) => t.trip_id === tripId);
  check(G4, 'after payment the trip becomes confirmed', r.status === 200 && paid.status === 'confirmed' && paid.booking_status === 'confirmed', `pay ${r.status}, trip ${paid && paid.status}`);

  r = await http('POST', `/api/bookings/${bk.booking_id}/cancel`, { token: A.token, body: { reason: 'flow test' } });
  const cancelled = (await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token })).json.find((t) => t.trip_id === tripId);
  check(G4, 'cancelling the booking puts the trip back to planned', r.status === 200 && cancelled.status === 'planned' && cancelled.booking_id === null, `cancel ${r.status}, trip ${cancelled && cancelled.status}`);
  r = await book(tripId, dep.departure_id, A.token, 1);
  check(G4, 'after a cancellation the trip can be booked again', r.status === 200, `got ${r.status}: ${r.json && r.json.error}`);

  r = await http('DELETE', `/api/trips/${tripId}`, { token: A.token });
  check(G4, 'a trip that has a booking cannot be deleted (409)', r.status === 409, 'got ' + r.status);
  r = await http('DELETE', `/api/trips/${stayOnlyId}`, { token: A.token });
  check(G4, 'a trip without booking can be deleted', r.status === 200, 'got ' + r.status);

  const [[mismatch]] = await db.query(
    `SELECT COUNT(*) n FROM (SELECT d.departure_id FROM package_departures d LEFT JOIN bookings b ON b.departure_id = d.departure_id AND b.status <> 'cancelled'
      GROUP BY d.departure_id, d.seats_booked HAVING d.seats_booked <> COALESCE(SUM(b.travelers), 0)) x`);
  check(G4, 'seat counters still match the real bookings', mismatch.n === 0, mismatch.n + ' departures differ');

  // ---------- cleanup ----------
  try {
    const [us] = await db.query("SELECT user_id FROM users WHERE email LIKE 'flowtest-%@tripnest.local'");
    const ids = us.map((u) => u.user_id);
    if (ids.length) {
      await db.query("UPDATE bookings SET status = 'cancelled' WHERE user_id IN (?)", [ids]);   // trigger gives the seats back
      await db.query('DELETE FROM refunds WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id IN (?))', [ids]);
      await db.query('DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id IN (?))', [ids]);
      await db.query('DELETE FROM email_log WHERE user_id IN (?)', [ids]);
      await db.query('DELETE FROM bookings WHERE user_id IN (?)', [ids]);
      await db.query('DELETE FROM trips WHERE user_id IN (?)', [ids]);
      try { await db.query('DELETE FROM sessions WHERE user_id IN (?)', [ids]); } catch (e) { /* no sessions table */ }
      await db.query('DELETE FROM users WHERE user_id IN (?)', [ids]);
    }
  } catch (e) { console.log('(cleanup warning: ' + e.message + ')'); }
  await db.end();

  let group = '';
  for (const x of results) {
    if (x.group !== group) { group = x.group; console.log('\n' + group); }
    console.log('  ' + (x.ok ? 'PASS' : 'FAIL') + '  ' + x.name + (x.ok || !x.detail ? '' : '   <- ' + x.detail));
  }
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed` + (failed ? `, ${failed} FAILED` : ' - the flow is connected'));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
