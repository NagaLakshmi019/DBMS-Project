// TripNest - hotel stay test (viva demo): availability night by night, overlap, race, refunds, trips, expiry.
// Start the server first (node server.js), then:   cd backend && node test-hotel-booking.js
// Creates temporary users (stay-*@tripnest.local) and removes everything at the end.
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
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'tripnest', dateStrings: true, connectionLimit: 12,
  });
  const ts = Date.now();
  const reg = async (n) => (await http('POST', '/api/auth/register', { body: { fullname: 'Stay Tester ' + n, email: `stay-${n}-${ts}@tripnest.local`, password: 'Passw0rd!123' } })).json;
  const A = await reg('a'), B = await reg('b');
  if (!A || !A.token) { console.error('Could not register. Is the server running at ' + BASE + ' ?'); process.exit(2); }

  // room types of hotel 1 (Azure Cliff Resort): 11 Deluxe (6 units, 48h free cancel), 12 Suite (4, 72h), 13 Villa (2, non-refundable)
  const ROOM = { deluxe: 11, suite: 12, villa: 13 };
  const book = (token, room, inD, outD, guests = 2, rooms = 1) => http('POST', '/api/hotel-bookings', { token, body: { room_id: room, check_in: addDays(inD), check_out: addDays(outD), guests, rooms } });
  const avail = async (inD, outD, hotel = 1) => {
    const r = (await http('GET', `/api/hotels/${hotel}/availability?check_in=${addDays(inD)}&check_out=${addDays(outD)}`)).json;
    return Object.fromEntries(r.map((x) => [x.room_id, x.available]));
  };

  // ---------- 0. Every hotel page has its data (guards against the broken-image problem) ----------
  const G0 = '0. Every hotel has full details';
  const all = (await http('GET', '/api/hotels-full')).json;
  const incomplete = Object.values(all).filter((h) => !h.images.length || !h.rooms.length || !h.amenities.length || !h.faqs.length).map((h) => h.name);
  check(G0, 'all ' + Object.keys(all).length + ' hotels have photos, rooms, amenities and FAQs', incomplete.length === 0, incomplete.join(', '));
  check(G0, 'every room type has an id and an inventory (units)', Object.values(all).every((h) => h.rooms.every((r) => r.id && r.units > 0 && r.maxGuests > 0)));
  check(G0, 'every hotel has a rating from its reviews', Object.values(all).every((h) => h.rating > 0 && h.reviewsCount > 0));

  // ---------- 1. Availability and overlap ----------
  const G1 = '1. Availability is calculated night by night';
  const base = 200;                                              // far future so other data cannot interfere
  let av = await avail(base, base + 4);
  check(G1, 'API returns real numbers for every room type', Object.values(av).every((n) => typeof n === 'number') && av[ROOM.villa] === 2, JSON.stringify(av));
  let r = await book(A.token, ROOM.villa, base, base + 2, 3, 2);                         // villa: both units, nights 1-2
  check(G1, 'booking both villas for nights 1-2 works', r.status === 200 && r.json.status === 'pending' && r.json.nights === 2, `got ${r.status}: ${r.text.slice(0, 120)}`);
  av = await avail(base, base + 2);
  check(G1, 'same dates now show 0 villas left', av[ROOM.villa] === 0, JSON.stringify(av));
  av = await avail(base + 2, base + 4);
  check(G1, 'back-to-back: arriving the day the other guest leaves is NOT a clash (2 left)', av[ROOM.villa] === 2, JSON.stringify(av));
  r = await book(B.token, ROOM.villa, base + 1, base + 3, 2, 1);
  check(G1, 'an overlapping request (shares night 2) is rejected: sold out (409)', r.status === 409 && /Sold out/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);

  // per-night correctness: suite has 4 units. 3 rooms on nights 1-2, 3 rooms on nights 3-4 -> 1 free room on EVERY night
  await book(A.token, ROOM.suite, base + 10, base + 12, 3, 3);
  await book(A.token, ROOM.suite, base + 12, base + 14, 3, 3);
  r = await book(B.token, ROOM.suite, base + 11, base + 13, 2, 1);
  check(G1, 'per-night rule: 1 room is free on each of nights 2 and 3, so 1 room is accepted', r.status === 200, `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await book(B.token, ROOM.suite, base + 11, base + 13, 2, 1);
  check(G1, '...but not a second one (that night is now full)', r.status === 409, `got ${r.status}`);

  // ---------- 2. Race ----------
  const G2 = '2. Ten guests book the last 3 deluxe rooms at the same moment';
  const [[room11]] = await db.query('SELECT units FROM rooms WHERE room_id = ?', [ROOM.deluxe]);
  const raceDay = base + 30;
  // use up (units - 3) rooms first so exactly 3 are left
  if (room11.units > 3) await book(A.token, ROOM.deluxe, raceDay, raceDay + 2, 2 * (room11.units - 3), room11.units - 3);
  const shots = await Promise.all(Array.from({ length: 10 }, (_, i) => book(i % 2 ? B.token : A.token, ROOM.deluxe, raceDay, raceDay + 2, 2, 1)));
  const wins = shots.filter((s) => s.status === 200).length;
  const [[maxN]] = await db.query(
    `SELECT COALESCE(MAX(x.b), 0) m FROM (SELECT SUM(rooms_count) b FROM hotel_bookings hb JOIN (SELECT 0 o UNION SELECT 1) n
      WHERE room_id = ? AND status <> 'cancelled' AND hb.check_in <= DATE_ADD(?, INTERVAL n.o DAY) AND hb.check_out > DATE_ADD(?, INTERVAL n.o DAY) GROUP BY n.o) x`, [ROOM.deluxe, addDays(raceDay), addDays(raceDay)]);
  check(G2, 'exactly 3 of the 10 requests succeed', wins === 3, wins + ' succeeded');
  check(G2, 'no night is ever booked above the number of rooms the hotel has', Number(maxN.m) <= room11.units, 'max booked ' + maxN.m + ' of ' + room11.units);

  // ---------- 3. Validation ----------
  const G3 = '3. The rules are enforced';
  r = await http('POST', '/api/hotel-bookings', { body: { room_id: ROOM.deluxe, guests: 2, check_in: addDays(base + 50), check_out: addDays(base + 52) } });
  check(G3, 'booking without login is rejected (401)', r.status === 401, 'got ' + r.status);
  r = await book(A.token, ROOM.deluxe, base + 50, base + 52, 5, 1);
  check(G3, 'too many guests for the room type is rejected', r.status === 409 && /at most/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await book(A.token, ROOM.deluxe, 0, 2);
  check(G3, 'check-in today or earlier is rejected', r.status === 409 && /tomorrow/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await book(A.token, ROOM.deluxe, base + 60, base + 100);
  check(G3, 'a stay longer than 30 nights is rejected', r.status === 409 && /30 nights/.test(r.json.error), `got ${r.status}`);
  r = await book(A.token, 999999, base + 50, base + 52);
  check(G3, 'unknown room type gives a clean 404', r.status === 404, 'got ' + r.status);
  r = await http('POST', '/api/hotel-bookings', { token: A.token, body: { room_id: ROOM.deluxe, guests: 2, check_in: addDays(base + 52), check_out: addDays(base + 50) } });
  check(G3, 'check-out before check-in is rejected', r.status === 409 || r.status === 400, 'got ' + r.status);

  // ---------- 4. Pay and cancel: the refund follows the ROOM's own policy ----------
  const G4 = '4. Pay, cancel and refund';
  const pay = (token, id) => http('POST', '/api/pay', { token, body: { hotel_booking_id: id, method: 'card' } });
  const cancel = (token, id) => http('POST', `/api/hotel-bookings/${id}/cancel`, { token, body: { reason: 'stay test' } });
  const refundsOf = async (id) => (await db.query('SELECT percent_refunded p, amount FROM refunds WHERE hotel_booking_id = ?', [id]))[0];

  let s1 = (await book(A.token, ROOM.deluxe, base + 70, base + 73, 2, 1)).json;           // 48h free cancellation, far away
  const pays = await Promise.all(Array.from({ length: 5 }, () => pay(A.token, s1.hotel_booking_id)));
  const [[pc]] = await db.query('SELECT COUNT(*) n FROM payments WHERE hotel_booking_id = ?', [s1.hotel_booking_id]);
  check(G4, '5 simultaneous pay clicks create exactly 1 payment', pc.n === 1 && pays.filter((p) => p.status === 200).length === 1, `payments ${pc.n}`);
  r = await cancel(A.token, s1.hotel_booking_id);
  check(G4, 'free-cancellation room cancelled early: 100% refund', r.status === 200 && r.json.refund_percent === 100 && Number(r.json.refund_amount) === Number(s1.total_price), JSON.stringify(r.json));
  check(G4, 'the refund row belongs to the stay (hotel_booking_id)', (await refundsOf(s1.hotel_booking_id)).length === 1);
  r = await cancel(A.token, s1.hotel_booking_id);
  check(G4, 'cancelling twice is rejected (409)', r.status === 409, 'got ' + r.status);

  let s2 = (await book(A.token, ROOM.villa, base + 80, base + 82, 3, 1)).json;            // non-refundable room
  await pay(A.token, s2.hotel_booking_id);
  r = await cancel(A.token, s2.hotel_booking_id);
  check(G4, 'non-refundable room: cancel works but refund is 0%', r.status === 200 && r.json.refund_percent === 0 && (await refundsOf(s2.hotel_booking_id)).length === 0, JSON.stringify(r.json));

  let s3 = (await book(A.token, ROOM.suite, 2, 4, 2, 1)).json;                            // 72h policy but check-in is in ~2 days
  await pay(A.token, s3.hotel_booking_id);
  r = await cancel(A.token, s3.hotel_booking_id);
  check(G4, 'cancelled too late for the 72h policy: 0% refund', r.status === 200 && r.json.refund_percent === 0, JSON.stringify(r.json));

  let s4 = (await book(A.token, ROOM.deluxe, base + 90, base + 92, 2, 1)).json;           // never paid
  r = await cancel(B.token, s4.hotel_booking_id);
  check(G4, "another user cannot cancel my stay (404)", r.status === 404, 'got ' + r.status);
  r = await pay(B.token, s4.hotel_booking_id);
  check(G4, "another user cannot pay my stay (404)", r.status === 404, 'got ' + r.status);
  r = await cancel(A.token, s4.hotel_booking_id);
  check(G4, 'an unpaid stay is simply released (no refund, no error)', r.status === 200 && r.json.refund_percent === 0);
  const mine = (await http('GET', `/api/users/${A.user_id}/hotel-bookings`, { token: A.token })).json;
  check(G4, 'My Stays lists them with hotel and room names', Array.isArray(mine) && mine.length >= 4 && mine.every((m) => m.hotel && m.room));
  r = await http('GET', `/api/users/${A.user_id}/hotel-bookings`, { token: B.token });
  check(G4, "nobody can read another user's stays (403)", r.status === 403, 'got ' + r.status);

  // ---------- 5. Stays belong to trips ----------
  const G5 = '5. Trip -> stay';
  const dests = (await http('GET', '/api/destinations')).json;
  const sant = dests.find((d) => d.name === 'Santorini');
  const santOpt = (await http('GET', `/api/destinations/${sant.dest_id}/options`)).json;
  const plan = (extra) => http('POST', '/api/plan-trip', { token: A.token, body: { destination_id: sant.dest_id, travelers: 2, budget: 3000, start_date: addDays(base + 100), end_date: addDays(base + 103), ...extra } });
  const stayTrip = (await plan({ hotel_id: santOpt.hotels[0].hotel_id })).json;           // hotel only, no package
  const pkgTrip = (await plan({ hotel_id: santOpt.hotels[0].hotel_id, package_id: santOpt.packages[0].package_id })).json;
  const bookStay = (token, trip, room, extra = {}) => http('POST', `/api/trips/${trip}/book-stay`, { token, body: { room_id: room, ...extra } });

  r = await bookStay(A.token, pkgTrip.trip_id, ROOM.suite);
  check(G5, 'a trip with a package cannot book a separate stay (409)', r.status === 409 && /includes the stay/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await bookStay(A.token, stayTrip.trip_id, 75);       // 75 = a room of the Venice hotel
  check(G5, "a room of another hotel is rejected (409)", r.status === 409 && /different hotel/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await bookStay(B.token, stayTrip.trip_id, ROOM.suite);
  check(G5, 'another user cannot book my trip (404)', r.status === 404, 'got ' + r.status);
  r = await bookStay(A.token, stayTrip.trip_id, ROOM.suite, { guests: 2 });
  const stay = r.json;
  check(G5, 'booking the stay of my trip works and uses the trip dates', r.status === 200 && stay.trip_id === stayTrip.trip_id && stay.check_in === addDays(base + 100) && stay.nights === 3, `got ${r.status}: ${r.text.slice(0, 100)}`);
  r = await bookStay(A.token, stayTrip.trip_id, ROOM.deluxe);
  check(G5, 'the same trip cannot have two active stays (409)', r.status === 409, 'got ' + r.status);
  let tv = (await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token })).json.find((t) => t.trip_id === stayTrip.trip_id);
  check(G5, 'My Trips shows the stay (stay_status pending)', tv && tv.stay_id === stay.hotel_booking_id && tv.stay_status === 'pending', JSON.stringify(tv));
  await pay(A.token, stay.hotel_booking_id);
  tv = (await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token })).json.find((t) => t.trip_id === stayTrip.trip_id);
  check(G5, 'after payment the trip becomes confirmed', tv.status === 'confirmed' && tv.stay_status === 'confirmed', JSON.stringify(tv));
  r = await http('DELETE', `/api/trips/${stayTrip.trip_id}`, { token: A.token });
  check(G5, 'a trip with a stay cannot be deleted (409)', r.status === 409, 'got ' + r.status);
  await cancel(A.token, stay.hotel_booking_id);
  tv = (await http('GET', `/api/users/${A.user_id}/trips`, { token: A.token })).json.find((t) => t.trip_id === stayTrip.trip_id);
  check(G5, 'cancelling the stay puts the trip back to planned', tv.status === 'planned' && tv.stay_id === null, JSON.stringify(tv));
  r = await bookStay(A.token, stayTrip.trip_id, ROOM.deluxe);
  check(G5, 'after a cancellation the trip can book a stay again', r.status === 200, `got ${r.status}`);

  // ---------- 6. Unpaid stays expire ----------
  const G6 = '6. Unpaid stays expire after 30 minutes';
  let s5 = (await book(A.token, ROOM.deluxe, base + 120, base + 122, 2, 1)).json;
  check(G6, 'a new stay has a 30 minute payment window', s5.hold_minutes >= 29 && s5.hold_minutes <= 30, 'minutes ' + s5.hold_minutes);
  await db.query('UPDATE hotel_bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE hotel_booking_id = ?', [s5.hotel_booking_id]);
  r = await pay(A.token, s5.hotel_booking_id);
  check(G6, 'paying after the window is refused (409)', r.status === 409 && /payment window/.test(r.json.error), `got ${r.status}: ${r.text.slice(0, 100)}`);
  await db.query('CALL sp_expire_pending_bookings()');
  const [[ex]] = await db.query('SELECT status FROM hotel_bookings WHERE hotel_booking_id = ?', [s5.hotel_booking_id]);
  const [[mail]] = await db.query("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND subject = 'TripNest stay expired'", [A.user_id]);
  check(G6, 'the expiry job cancels it, frees the rooms and writes an email', ex.status === 'cancelled' && mail.n >= 1, `status ${ex.status}, emails ${mail.n}`);

  // ---------- 7. The database itself ----------
  const G7 = '7. The database enforces the rules';
  const sqlErr = async (sql, args) => { try { await db.query(sql, args); return null; } catch (e) { return e.errno; } };
  const wrongRoom = await sqlErr('INSERT INTO hotel_bookings (user_id, hotel_id, room_id, check_in, check_out, guests, price_per_night) VALUES (?,?,?,?,?,2,100)', [A.user_id, 1, 75, addDays(base + 150), addDays(base + 152)]);
  check(G7, 'a room cannot be booked under another hotel (error 1452, composite foreign key)', wrongRoom === 1452, 'errno ' + wrongRoom);
  const badDates = await sqlErr('INSERT INTO hotel_bookings (user_id, hotel_id, room_id, check_in, check_out, guests, price_per_night) VALUES (?,?,?,?,?,2,100)', [A.user_id, 1, 11, addDays(base + 152), addDays(base + 150)]);
  check(G7, 'check-out before check-in is refused by a CHECK constraint (error 3819)', badDates === 3819, 'errno ' + badDates);
  const dup = await sqlErr('INSERT INTO hotel_bookings (user_id, hotel_id, room_id, trip_id, check_in, check_out, guests, price_per_night) SELECT ?,1,11,trip_id,?,?,2,100 FROM hotel_bookings WHERE trip_id = ? AND status <> ? LIMIT 1',
    [A.user_id, addDays(base + 160), addDays(base + 162), stayTrip.trip_id, 'cancelled']);
  check(G7, 'a second active stay for the same trip is refused by a unique index (error 1062)', dup === 1062, 'errno ' + dup);
  const [[tot]] = await db.query('SELECT nights, rooms_count, price_per_night, subtotal, tax, total_price FROM hotel_bookings WHERE hotel_booking_id = ?', [s1.hotel_booking_id]);
  const expectSub = tot.nights * tot.rooms_count * Number(tot.price_per_night);
  check(G7, 'total = nights x rooms x price + 12% tax, calculated by the database', Math.abs(Number(tot.subtotal) - expectSub) < 0.01 && Math.abs(Number(tot.total_price) - (expectSub + Math.round(expectSub * 12) / 100)) < 0.02, JSON.stringify(tot));
  await db.query('UPDATE rooms SET price = price + 100 WHERE room_id = ?', [ROOM.deluxe]);
  const [[snap]] = await db.query('SELECT price_per_night FROM hotel_bookings WHERE hotel_booking_id = ?', [s1.hotel_booking_id]);
  await db.query('UPDATE rooms SET price = price - 100 WHERE room_id = ?', [ROOM.deluxe]);
  check(G7, 'a later price change does not touch an existing booking (price is copied)', Number(snap.price_per_night) === 310, 'price ' + snap.price_per_night);

  // ---------- cleanup ----------
  try {
    const [us] = await db.query("SELECT user_id FROM users WHERE email LIKE 'stay-%@tripnest.local'");
    const ids = us.map((u) => u.user_id);
    if (ids.length) {
      await db.query('DELETE FROM hotel_bookings WHERE user_id IN (?)', [ids]);          // payments and refunds go with them (ON DELETE CASCADE)
      await db.query('DELETE FROM email_log WHERE user_id IN (?)', [ids]);
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
  console.log(`\n${results.length - failed}/${results.length} checks passed` + (failed ? `, ${failed} FAILED` : ' - hotel stays work'));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
