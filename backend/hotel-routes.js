// TripNest - hotel stays: availability, booking a room, booking the stay of a trip, my stays, cancel, admin.
// Used from server.js:  require('./hotel-routes')(app, db, wrap, auth, adminOnly, self);

module.exports = (app, db, wrap, auth, adminOnly, self) => {
  const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

  // Business-rule messages raised by the stored procedures (SQLSTATE 45000) become clean HTTP errors.
  const ruleError = (res, e) => {
    const m = e.sqlMessage;
    const notFound = m === 'Trip not found' || m === 'Room type not found' || m === 'Stay not found';
    return res.status(notFound ? 404 : 409).json({ error: m });
  };

  // ---------- PUBLIC: which room types are free for these dates? (night-by-night, see sp_room_availability) ----------
  app.get('/api/hotels/:id/availability', wrap(async (req, res) => {
    const hotelId = parseInt(req.params.id, 10);
    const { check_in, check_out } = req.query;
    if (!hotelId || !isDate(check_in) || !isDate(check_out))
      return res.status(400).json({ error: 'check_in and check_out (YYYY-MM-DD) are required' });
    try {
      const [result] = await db.query('CALL sp_room_availability(?,?,?)', [hotelId, check_in, check_out]);
      // MySQL returns DECIMAL/SUM values as strings: the page needs real numbers
      res.json(result[0].map((r) => ({ ...r, price: Number(r.price), available: Math.max(Number(r.available), 0) })));
    } catch (e) {
      if (e.sqlState === '45000') return res.status(400).json({ error: e.sqlMessage });
      throw e;
    }
  }));

  // ---------- CUSTOMER: book a room directly from the hotel page ----------
  app.post('/api/hotel-bookings', auth, wrap(async (req, res) => {
    const roomId = parseInt(req.body.room_id, 10);
    const guests = parseInt(req.body.guests, 10);
    const rooms = parseInt(req.body.rooms, 10) || 1;
    const { check_in, check_out } = req.body;
    if (!roomId || !guests || !isDate(check_in) || !isDate(check_out))
      return res.status(400).json({ error: 'room_id, guests, check_in and check_out are required' });
    try {
      const [result] = await db.query('CALL sp_book_room(?,?,?,?,?,?,NULL)', [req.user.user_id, roomId, check_in, check_out, guests, rooms]);
      res.json(result[0][0]);
    } catch (e) {
      if (e.sqlState === '45000') return ruleError(res, e);
      throw e;
    }
  }));

  // ---------- CUSTOMER: book the stay of one of MY trips (dates come from the trip) ----------
  app.post('/api/trips/:id/book-stay', auth, wrap(async (req, res) => {
    const tripId = parseInt(req.params.id, 10);
    const roomId = parseInt(req.body.room_id, 10);
    const rooms = parseInt(req.body.rooms, 10) || 1;
    if (!tripId || !roomId) return res.status(400).json({ error: 'room_id is required' });
    const [t] = await db.query('SELECT start_date, end_date, travelers FROM trips WHERE trip_id = ? AND user_id = ?', [tripId, req.user.user_id]);
    if (!t.length) return res.status(404).json({ error: 'Trip not found' });
    const guests = parseInt(req.body.guests, 10) || t[0].travelers || 1;
    try {
      const [result] = await db.query('CALL sp_book_room(?,?,?,?,?,?,?)',
        [req.user.user_id, roomId, t[0].start_date, t[0].end_date, guests, rooms, tripId]);
      res.json(result[0][0]);
    } catch (e) {
      if (e.sqlState === '45000') return ruleError(res, e);
      throw e;
    }
  }));

  // ---------- CUSTOMER: my stays ----------
  app.get('/api/users/:id/hotel-bookings', auth, self, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT hb.hotel_booking_id, h.name AS hotel, r.name AS room, hb.check_in, hb.check_out, hb.nights, hb.rooms_count, hb.guests,
              hb.total_price, hb.status, hb.trip_id, r.free_cancel_hours, r.cancellation,
              CASE WHEN hb.status = 'pending' AND hb.hold_expires_at IS NOT NULL
                   THEN GREATEST(TIMESTAMPDIFF(MINUTE, NOW(), hb.hold_expires_at), 0) END AS hold_minutes_left
       FROM hotel_bookings hb JOIN hotels h ON h.hotel_id = hb.hotel_id JOIN rooms r ON r.room_id = hb.room_id
       WHERE hb.user_id = ? ORDER BY hb.hotel_booking_id DESC`, [req.params.id]);
    res.json(rows);
  }));

  // ---------- CUSTOMER: cancel a stay (refund follows the room's own policy, inside the procedure) ----------
  app.post('/api/hotel-bookings/:id/cancel', auth, wrap(async (req, res) => {
    try {
      const [result] = await db.query('CALL sp_cancel_hotel_booking(?,?,?)',
        [parseInt(req.params.id, 10), req.user.user_id, String(req.body.reason || '').slice(0, 200)]);
      res.json(result[0][0]);
    } catch (e) {
      if (e.sqlState === '45000') return ruleError(res, e);
      throw e;
    }
  }));

  // ---------- ADMIN ----------
  app.get('/api/admin/hotel-bookings', adminOnly, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT hb.hotel_booking_id, u.full_name, h.name AS hotel, r.name AS room, hb.check_in, hb.check_out, hb.rooms_count, hb.guests, hb.total_price, hb.status
       FROM hotel_bookings hb JOIN users u ON u.user_id = hb.user_id JOIN hotels h ON h.hotel_id = hb.hotel_id JOIN rooms r ON r.room_id = hb.room_id
       ORDER BY hb.hotel_booking_id DESC`);
    res.json(rows);
  }));

  // like package bookings: admins can only cancel (a stay becomes confirmed when the guest pays)
  app.patch('/api/admin/hotel-bookings/:id', adminOnly, wrap(async (req, res) => {
    if (req.body.status !== 'cancelled')
      return res.status(400).json({ error: 'Admins can only cancel a stay. It becomes confirmed automatically when the guest pays.' });
    const id = parseInt(req.params.id, 10);
    const [rows] = await db.query('SELECT user_id FROM hotel_bookings WHERE hotel_booking_id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Stay not found' });
    try {
      const [result] = await db.query('CALL sp_cancel_hotel_booking(?,?,?)', [id, rows[0].user_id, 'Cancelled by admin']);
      res.json({ message: 'Cancelled', ...result[0][0] });
    } catch (e) {
      if (e.sqlState === '45000') return res.status(400).json({ error: e.sqlMessage });
      throw e;
    }
  }));
};
