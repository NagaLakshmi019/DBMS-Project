// TripNest - demo/test for database/08: review rating triggers + unpaid booking expiry.
//   cd backend && node test-hold-and-ratings.js          (waits for the REAL MySQL event, up to ~90 seconds)
//   cd backend && node test-hold-and-ratings.js --now    (calls the expiry procedure directly, instant)
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const NOW_MODE = process.argv.includes('--now');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (ok || !detail ? '' : '   <- ' + detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'tripnest', dateStrings: true, connectionLimit: 10,
  });
  const email = `holdtest-${Date.now()}@tripnest.local`;
  await db.query("INSERT INTO users (full_name, email, password_hash) VALUES ('Hold Tester', ?, 'x')", [email]);
  const [[u]] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
  const [[pkg]] = await db.query('SELECT package_id FROM packages ORDER BY package_id LIMIT 1');
  let depId = null;

  try {
    // =====================================================================
    console.log('\nPART A. Hotel rating follows the reviews (triggers + AVG)');
    const hotel = 1;
    const rating = async () => Number((await db.query('SELECT rating FROM hotels WHERE hotel_id = ?', [hotel]))[0][0].rating);
    const realAvg = async () => Number((await db.query('SELECT ROUND(AVG(rating),1) a FROM reviews WHERE hotel_id = ?', [hotel]))[0][0].a);
    const before = await rating();
    console.log('  hotel 1 rating now:', before);
    check('stored rating equals the average of its reviews', before === await realAvg(), `stored ${before}, real ${await realAvg()}`);

    const [ins] = await db.query("INSERT INTO reviews (user_id, hotel_id, rating, comment) VALUES (?,?,1,'trigger test')", [u.user_id, hotel]);
    const afterInsert = await rating();
    console.log('  after adding a 1-star review:', afterInsert);
    check('INSERT review -> rating drops automatically', afterInsert < before && afterInsert === await realAvg());

    await db.query('UPDATE reviews SET rating = 5 WHERE review_id = ?', [ins.insertId]);
    const afterUpdate = await rating();
    console.log('  after changing it to 5 stars:', afterUpdate);
    check('UPDATE review -> rating goes up automatically', afterUpdate > afterInsert && afterUpdate === await realAvg());

    await db.query('DELETE FROM reviews WHERE review_id = ?', [ins.insertId]);
    const afterDelete = await rating();
    console.log('  after deleting it:', afterDelete);
    check('DELETE review -> rating returns to the original value', afterDelete === before);

    const [bad] = await db.query(
      'SELECT h.hotel_id FROM hotels h JOIN reviews r ON r.hotel_id = h.hotel_id GROUP BY h.hotel_id, h.rating HAVING h.rating <> ROUND(AVG(r.rating),1)');
    check('no hotel has a rating that differs from its reviews', bad.length === 0, bad.length + ' hotels differ');

    // =====================================================================
    console.log('\nPART B. Unpaid bookings expire, paid ones do not');
    const [d] = await db.query(
      'INSERT INTO package_departures (package_id, departure_date, seats_total) VALUES (?, DATE_ADD(CURDATE(), INTERVAL 800 DAY), 5)', [pkg.package_id]);
    depId = d.insertId;
    const seatsLeft = async () => (await db.query('SELECT seats_left s FROM package_departures WHERE departure_id = ?', [depId]))[0][0].s;
    const book = async (n) => (await db.query('CALL sp_book_package(?,?,?)', [u.user_id, depId, n]))[0][0][0];

    const unpaid = await book(2);
    const paid = await book(1);
    await db.query("INSERT INTO payments (booking_id, amount, method, txn_ref) VALUES (?,?, 'card', ?)", [paid.booking_id, paid.total_price, 'HT' + Date.now()]);
    console.log(`  booked 2 seats (unpaid) + 1 seat (paid); payment deadline for the unpaid one: ${unpaid.hold_minutes} minutes`);
    check('new booking has a ~30 minute payment window', unpaid.hold_minutes >= 29 && unpaid.hold_minutes <= 30, 'got ' + unpaid.hold_minutes);
    check('seats are held: 5 - 3 = 2 left', await seatsLeft() === 2, 'left ' + await seatsLeft());

    // pretend the 30 minutes have passed
    await db.query('UPDATE bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE booking_id IN (?, ?)', [unpaid.booking_id, paid.booking_id]);
    const statusOf = async (id) => (await db.query('SELECT status, cancel_reason FROM bookings WHERE booking_id = ?', [id]))[0][0];

    if (NOW_MODE) {
      await db.query('CALL sp_expire_pending_bookings()');
    } else {
      const [[sch]] = await db.query('SELECT @@event_scheduler s');
      console.log(`  waiting for the MySQL event ev_expire_pending_bookings (scheduler is ${sch.s}; it runs every minute)...`);
      for (let t = 0; t < 90 && (await statusOf(unpaid.booking_id)).status === 'pending'; t += 3) { await sleep(3000); process.stdout.write('.'); }
      console.log('');
    }
    const su = await statusOf(unpaid.booking_id), sp = await statusOf(paid.booking_id);
    check('unpaid booking was cancelled by the expiry job', su.status === 'cancelled' && su.cancel_reason === 'Payment window expired', JSON.stringify(su));
    check('PAID booking was not touched (still confirmed)', sp.status === 'confirmed', JSON.stringify(sp));
    check('its 2 seats went back on sale (trigger): 5 - 1 = 4 left', await seatsLeft() === 4, 'left ' + await seatsLeft());
    const [[mail]] = await db.query("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND subject = 'TripNest booking expired' AND body LIKE ?", [u.user_id, `%#${unpaid.booking_id} %`]);
    check('customer got an "expired" email in email_log', mail.n === 1, 'emails: ' + mail.n);

    // many expiry jobs at the same instant must still cancel only once
    const again = await book(2);
    await db.query('UPDATE bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE booking_id = ?', [again.booking_id]);
    await Promise.all(Array.from({ length: 5 }, () => db.query('CALL sp_expire_pending_bookings()')));
    const [[mail2]] = await db.query("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND body LIKE ?", [u.user_id, `%#${again.booking_id} %`]);
    check('5 expiry jobs at the same moment: cancelled once, 1 email, seats released once',
      (await statusOf(again.booking_id)).status === 'cancelled' && mail2.n === 1 && await seatsLeft() === 4, `emails ${mail2.n}, seats left ${await seatsLeft()}`);
  } finally {
    // cleanup
    try {
      await db.query("UPDATE bookings SET status = 'cancelled' WHERE user_id = ? AND status <> 'cancelled'", [u.user_id]);
      await db.query('DELETE FROM refunds WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id = ?)', [u.user_id]);
      await db.query('DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id = ?)', [u.user_id]);
      for (const t of ['bookings', 'reviews', 'email_log']) await db.query(`DELETE FROM ${t} WHERE user_id = ?`, [u.user_id]);
      if (depId) await db.query('DELETE FROM package_departures WHERE departure_id = ?', [depId]);
      await db.query('DELETE FROM users WHERE user_id = ?', [u.user_id]);
    } catch (e) { console.log('(cleanup warning: ' + e.message + ')'); }
    await db.end();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed` + (failed ? `, ${failed} FAILED` : ' - all good'));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
