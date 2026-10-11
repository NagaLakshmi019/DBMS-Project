// TripNest - extra routes: search/filter, reviews, wishlist, payment (simulated), email log, admin lists
// (register / login / logout now live in auth-routes.js)

module.exports = (app, db, wrap, auth, adminOnly, limiter) => {
  const num = (v) => (v !== undefined && v !== '' && !isNaN(v) ? Number(v) : null);

  // ---------- SEARCH + FILTER (indexed columns) ----------
  const searchRoute = (table, cfg) => app.get('/api/search/' + table, wrap(async (req, res) => {
    const q = req.query, where = [], args = [];
    if (q.q) { q.q = String(q.q).slice(0, 60); where.push('(' + cfg.text.map((c) => `${c} LIKE ?`).join(' OR ') + ')'); cfg.text.forEach(() => args.push('%' + q.q + '%')); }
    if (num(q.min) !== null) { where.push(`${cfg.price} >= ?`); args.push(num(q.min)); }
    if (num(q.max) !== null) { where.push(`${cfg.price} <= ?`); args.push(num(q.max)); }
    if (num(q.rating) !== null) { where.push('rating >= ?'); args.push(num(q.rating)); }
    (cfg.eq || []).forEach((f) => { if (q[f]) { where.push(`${f} = ?`); args.push(q[f]); } });
    const sort = Object.hasOwn(cfg.sorts, q.sort) ? cfg.sorts[q.sort] : cfg.sorts.default;
    const [rows] = await db.query(
      `SELECT * FROM ${table}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT 100`, args);
    res.json(rows);
  }));
  const sorts = (p) => ({ default: 'rating DESC', rating: 'rating DESC', price_asc: `${p} ASC`, price_desc: `${p} DESC` });
  searchRoute('destinations', { text: ['name', 'country'], price: 'price', eq: ['continent', 'best_season', 'style'], sorts: sorts('price') });
  searchRoute('hotels', { text: ['name'], price: 'price_per_night', eq: ['stars', 'dest_id'], sorts: sorts('price_per_night') });
  searchRoute('packages', { text: ['name', 'tag'], price: 'price', eq: ['category'], sorts: sorts('price') });

  // ---------- REVIEWS ----------
  app.get('/api/hotels/:id/reviews', wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT r.review_id, COALESCE(u.full_name, r.reviewer_name, 'Guest') AS full_name, r.rating, r.comment, r.created_at
       FROM reviews r LEFT JOIN users u ON r.user_id = u.user_id WHERE r.hotel_id = ? ORDER BY r.review_id DESC`, [req.params.id]);
    const [[a]] = await db.query('SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS total FROM reviews WHERE hotel_id = ?', [req.params.id]);
    res.json({ avg_rating: a.avg_rating, total: a.total, reviews: rows });
  }));
  const reviewLimit = limiter({ windowMs: 60 * 60 * 1000, max: 10, keyFn: (r) => 'u' + r.user.user_id,
    message: 'You are posting reviews too fast. Please try again later.' });
  app.post('/api/hotels/:id/reviews', auth, reviewLimit, wrap(async (req, res) => {
    const rating = parseInt(req.body.rating, 10);
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1 to 5' });
    const [h] = await db.query('SELECT hotel_id FROM hotels WHERE hotel_id = ?', [req.params.id]);
    if (!h.length) return res.status(404).json({ error: 'Hotel not found' });
    // stored as plain text; the page escapes it when showing (see hotel-details.js)
    await db.query('INSERT INTO reviews (user_id, hotel_id, rating, comment) VALUES (?,?,?,?)',
      [req.user.user_id, h[0].hotel_id, rating, String(req.body.comment || '').trim().slice(0, 1000)]);
    res.json({ message: 'Review added' });
  }));

  // ---------- WISHLIST (frontend cards destination peru tho untayi) ----------
  app.post('/api/wishlist/toggle', auth, wrap(async (req, res) => {
    const [d] = await db.query('SELECT dest_id FROM destinations WHERE name = ?', [req.body.dest_name]);
    if (!d.length) return res.status(404).json({ error: 'Destination not found' });
    const uid = req.user.user_id, did = d[0].dest_id;
    const [ex] = await db.query('SELECT 1 FROM wishlist WHERE user_id = ? AND dest_id = ?', [uid, did]);
    if (ex.length) { await db.query('DELETE FROM wishlist WHERE user_id = ? AND dest_id = ?', [uid, did]); return res.json({ saved: false }); }
    await db.query('INSERT INTO wishlist (user_id, dest_id) VALUES (?,?)', [uid, did]);
    res.json({ saved: true });
  }));
  app.get('/api/wishlist', auth, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT d.* FROM wishlist w JOIN destinations d ON w.dest_id = d.dest_id WHERE w.user_id = ? ORDER BY w.added_at DESC`, [req.user.user_id]);
    res.json(rows);
  }));

  // ---------- PAYMENT (SIMULATED, real gateway kaadu) + EMAIL LOG ----------
  // One transaction: lock the booking row, check it, insert the payment, write the email log, commit.
  // FOR UPDATE makes simultaneous "Pay" clicks wait in a queue, so a booking can never be charged twice.
  // Works for a package booking ({booking_id}) and for a hotel stay ({hotel_booking_id}).
  app.post('/api/pay', auth, wrap(async (req, res) => {
    const stayId = parseInt(req.body.hotel_booking_id, 10) || null;
    const bookingId = stayId ? null : parseInt(req.body.booking_id, 10);
    const method = req.body.method;
    if (!stayId && !bookingId) return res.status(400).json({ error: 'booking_id or hotel_booking_id is required' });
    if (!['card', 'upi', 'netbanking'].includes(method)) return res.status(400).json({ error: 'Invalid payment method' });

    const conn = await db.getConnection();
    let out;
    try {
      await conn.beginTransaction();
      const [b] = stayId
        ? await conn.query(
            `SELECT hb.status, hb.total_price, hb.check_in AS travel_date, u.email, CONCAT(h.name, ' (hotel stay)') AS package_name,
                    (hb.hold_expires_at IS NOT NULL AND hb.hold_expires_at < NOW()) AS expired
             FROM hotel_bookings hb JOIN users u ON u.user_id = hb.user_id JOIN hotels h ON h.hotel_id = hb.hotel_id
             WHERE hb.hotel_booking_id = ? AND hb.user_id = ? FOR UPDATE OF hb`, [stayId, req.user.user_id])
        : await conn.query(
            `SELECT b.booking_id, b.status, b.total_price, b.travel_date, u.email, p.name AS package_name,
                    (b.hold_expires_at IS NOT NULL AND b.hold_expires_at < NOW()) AS expired
             FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN packages p ON p.package_id = b.package_id
             WHERE b.booking_id = ? AND b.user_id = ? FOR UPDATE OF b`, [bookingId, req.user.user_id]);
      if (!b.length) out = [404, { error: 'Booking not found' }];
      else if (b[0].status === 'confirmed') out = [409, { error: 'Already paid' }];
      else if (b[0].status === 'cancelled') out = [400, { error: 'Booking is cancelled' }];
      else if (b[0].expired) out = [409, { error: 'The 30 minute payment window has expired. The reservation is released, please book again.' }];
      else {
        const ref = 'TN' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
        await conn.query(
          stayId ? 'INSERT INTO payments (hotel_booking_id, amount, method, txn_ref) VALUES (?,?,?,?)'
                 : 'INSERT INTO payments (booking_id, amount, method, txn_ref) VALUES (?,?,?,?)',
          [stayId || bookingId, b[0].total_price, method, ref]);                // trigger: booking -> confirmed
        await conn.query('INSERT INTO email_log (user_id, to_email, subject, body) VALUES (?,?,?,?)', [
          req.user.user_id, b[0].email, 'TripNest booking confirmed: ' + b[0].package_name,
          `Payment of $${b[0].total_price} received (ref ${ref}). Your booking on ${String(b[0].travel_date).slice(0, 10)} is confirmed.`]);
        out = [200, { txn_ref: ref, amount: b[0].total_price, status: 'confirmed' }];
      }
      if (out[0] === 200) await conn.commit(); else await conn.rollback();
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
    res.status(out[0]).json(out[1]);
  }));


  // ---------- HOTELS FULL (anni details tables nunchi, hotel page ki kavalsina shape lo) ----------
  app.get('/api/hotels-full', wrap(async (req, res) => {
    const q = (sql) => db.query(sql).then(([r]) => r);
    const [hotels, imgs, badges, amen, rooms, rfeat, rimgs, pol, rules, attr, faqs, revs] = await Promise.all([
      q('SELECT h.*, d.continent FROM hotels h JOIN destinations d ON d.dest_id = h.dest_id ORDER BY h.hotel_id'),
      q('SELECT hotel_id, url FROM hotel_images ORDER BY hotel_id, sort_order'),
      q('SELECT hotel_id, badge FROM hotel_badges ORDER BY hotel_id, sort_order'),
      q('SELECT ha.hotel_id, a.code, a.label FROM hotel_amenities ha JOIN amenities a ON a.amenity_id = ha.amenity_id ORDER BY ha.hotel_id, ha.sort_order'),
      q('SELECT * FROM rooms ORDER BY hotel_id, sort_order'),
      q('SELECT room_id, feature FROM room_features ORDER BY room_id, sort_order'),
      q('SELECT room_id, url FROM room_images ORDER BY room_id, sort_order'),
      q('SELECT hotel_id, label, policy_value FROM hotel_policies ORDER BY hotel_id, sort_order'),
      q('SELECT hotel_id, rule_text FROM hotel_rules ORDER BY hotel_id, sort_order'),
      q('SELECT hotel_id, icon, name, distance FROM hotel_attractions ORDER BY hotel_id, sort_order'),
      q('SELECT hotel_id, question, answer FROM hotel_faqs ORDER BY hotel_id, sort_order'),
      q(`SELECT r.hotel_id, COALESCE(u.full_name, r.reviewer_name, 'Guest') AS reviewer, r.rating, r.comment, r.created_at, r.helpful
         FROM reviews r LEFT JOIN users u ON r.user_id = u.user_id ORDER BY r.hotel_id, r.review_id DESC`),
    ]);
    const by = (rows, k) => rows.reduce((m, r) => { (m[r[k]] = m[r[k]] || []).push(r); return m; }, {});
    const bI = by(imgs, 'hotel_id'), bB = by(badges, 'hotel_id'), bA = by(amen, 'hotel_id'), bR = by(rooms, 'hotel_id'),
      bF = by(rfeat, 'room_id'), bRI = by(rimgs, 'room_id'), bP = by(pol, 'hotel_id'), bRu = by(rules, 'hotel_id'),
      bAt = by(attr, 'hotel_id'), bQ = by(faqs, 'hotel_id'), bV = by(revs, 'hotel_id');
    const out = {};
    hotels.forEach((h) => {
      const id = h.hotel_id, imgsOf = bI[id] || [], rv = bV[id] || [];
      out[id] = {
        id, name: h.name, location: h.location || '', rating: Number(h.rating) || 0, badges: (bB[id] || []).map((x) => x.badge),
        priceFrom: Number(h.price_per_night), reviewsCount: rv.length, address: h.address || '', description: h.description || '',
        coords: { lat: Number(h.latitude) || 0, lng: Number(h.longitude) || 0 },
        images: imgsOf.map((x) => x.url), videoUrl: h.video_url || '', videoPoster: imgsOf.length ? imgsOf[0].url : '', panorama: h.panorama_url || '',
        amenities: (bA[id] || []).map((x) => ({ icon: x.code, label: x.label })),
        rooms: (bR[id] || []).map((r) => ({
          id: r.room_id, name: r.name, size: r.size_label, capacity: r.capacity_label, bed: r.bed, price: Number(r.price), cancellation: r.cancellation,
          units: r.units, maxGuests: r.max_guests, freeCancelHours: r.free_cancel_hours,
          amenities: (bF[r.room_id] || []).map((x) => x.feature), images: (bRI[r.room_id] || []).map((x) => x.url) })),
        policies: (bP[id] || []).map((x) => ({ label: x.label, value: x.policy_value })),
        rules: (bRu[id] || []).map((x) => x.rule_text),
        attractions: (bAt[id] || []).map((x) => ({ icon: x.icon, name: x.name, distance: x.distance })),
        reviews: rv.map((x) => ({ name: x.reviewer, rating: x.rating, date: String(x.created_at).slice(0, 10), text: x.comment || '', helpful: x.helpful })),
        faqs: (bQ[id] || []).map((x) => ({ q: x.question, a: x.answer })),
        // similar = same destination first, then same continent, then the closest star rating
        similar: hotels.filter((o) => o.hotel_id !== id)
          .sort((a, b) => (b.dest_id === h.dest_id) - (a.dest_id === h.dest_id) || (b.continent === h.continent) - (a.continent === h.continent) || Math.abs(a.stars - h.stars) - Math.abs(b.stars - h.stars) || a.hotel_id - b.hotel_id)
          .slice(0, 3).map((o) => o.hotel_id),
      };
    });
    res.json(out);
  }));


  // ---------- BOOKING CANCEL + REFUNDS (stored procedure, transaction) ----------
  app.post('/api/bookings/:id/cancel', auth, wrap(async (req, res) => {
    try {
      const [result] = await db.query('CALL sp_cancel_booking(?,?,?)',
        [parseInt(req.params.id, 10), req.user.user_id, String(req.body.reason || '').slice(0, 200)]);
      res.json(result[0][0]);
    } catch (e) {
      if (e.sqlState === '45000') return res.status(400).json({ error: e.sqlMessage });
      throw e;
    }
  }));
  // refunds and payments belong either to a package booking or to a hotel stay (exactly one of the two)
  app.get('/api/refunds', auth, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT rf.refund_id, COALESCE(p.name, CONCAT(h.name, ' (hotel stay)')) AS package_name, rf.amount, rf.percent_refunded, rf.reason, rf.refund_ref, rf.status, rf.refunded_at
       FROM refunds rf
       LEFT JOIN bookings b ON rf.booking_id = b.booking_id LEFT JOIN packages p ON b.package_id = p.package_id
       LEFT JOIN hotel_bookings hb ON rf.hotel_booking_id = hb.hotel_booking_id LEFT JOIN hotels h ON hb.hotel_id = h.hotel_id
       WHERE COALESCE(b.user_id, hb.user_id) = ? ORDER BY rf.refund_id DESC`, [req.user.user_id]);
    res.json(rows);
  }));
  app.get('/api/admin/refunds', adminOnly, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT rf.refund_id, u.full_name, COALESCE(p.name, CONCAT(h.name, ' (hotel stay)')) AS package_name,
              COALESCE(rf.booking_id, CONCAT('stay #', rf.hotel_booking_id)) AS booking_id, rf.amount, rf.percent_refunded, rf.refund_ref, rf.status, rf.refunded_at
       FROM refunds rf
       LEFT JOIN bookings b ON rf.booking_id = b.booking_id LEFT JOIN packages p ON b.package_id = p.package_id
       LEFT JOIN hotel_bookings hb ON rf.hotel_booking_id = hb.hotel_booking_id LEFT JOIN hotels h ON hb.hotel_id = h.hotel_id
       JOIN users u ON u.user_id = COALESCE(b.user_id, hb.user_id) ORDER BY rf.refund_id DESC`);
    res.json(rows);
  }));

  // ---------- ADMIN LISTS ----------
  app.get('/api/admin/payments', adminOnly, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT p.payment_id, u.full_name, COALESCE(p.booking_id, CONCAT('stay #', p.hotel_booking_id)) AS booking_id, p.amount, p.method, p.status, p.txn_ref, p.paid_at
       FROM payments p
       LEFT JOIN bookings b ON p.booking_id = b.booking_id LEFT JOIN hotel_bookings hb ON p.hotel_booking_id = hb.hotel_booking_id
       JOIN users u ON u.user_id = COALESCE(b.user_id, hb.user_id) ORDER BY p.payment_id DESC`);
    res.json(rows);
  }));
  app.get('/api/admin/emails', adminOnly, wrap(async (req, res) => {
    const [rows] = await db.query('SELECT * FROM email_log ORDER BY email_id DESC');
    res.json(rows);
  }));
};
