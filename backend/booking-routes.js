// TripNest - seat availability routes: list departures, book seats, admin seat management.
// Used from server.js:  require('./booking-routes')(app, db, wrap, auth, adminOnly);

module.exports = (app, db, wrap, auth, adminOnly) => {
  // ---------- PUBLIC: upcoming departures of one package (shown in the booking modal) ----------
  // GET /api/departures?package_name=Santorini%20Sunset%20Escape   (or ?package_id=1)
  app.get('/api/departures', wrap(async (req, res) => {
    const { package_id, package_name } = req.query;
    let col, val;
    if (package_id) { col = 'package_id'; val = parseInt(package_id, 10); }
    else if (package_name) { col = 'package_name'; val = String(package_name); }
    else return res.status(400).json({ error: 'package_id or package_name is required' });

    const [rows] = await db.query(
      `SELECT departure_id, package_id, package_name, price, departure_date,
              seats_total, seats_left, availability
       FROM v_departure_availability
       WHERE ${col} = ? AND departure_date > CURDATE()
       ORDER BY departure_date`, [val]);
    res.json(rows);
  }));

  // ---------- CUSTOMER: book seats (user comes from the login token, never from the request body) ----------
  app.post('/api/book', auth, wrap(async (req, res) => {
    const departureId = parseInt(req.body.departure_id, 10);
    const travelers = parseInt(req.body.travelers, 10);
    if (!departureId || !travelers) return res.status(400).json({ error: 'departure_id and travelers are required' });
    if (travelers < 1 || travelers > 10) return res.status(400).json({ error: 'Travelers must be between 1 and 10' });
    try {
      // sp_book_package = one transaction: lock departure row -> check seats -> update seats -> insert booking
      const [result] = await db.query('CALL sp_book_package(?,?,?)', [req.user.user_id, departureId, travelers]);
      res.json(result[0][0]);
    } catch (e) {
      if (e.sqlState === '45000') return res.status(409).json({ error: e.sqlMessage }); // sold out, closed, etc.
      throw e;
    }
  }));

  // ---------- ADMIN: all departures with occupancy ----------
  app.get('/api/admin/departures', adminOnly, wrap(async (req, res) => {
    const [rows] = await db.query(
      `SELECT * FROM v_departure_availability ORDER BY departure_date, package_name`);
    res.json(rows);
  }));

  // ---------- ADMIN: add a departure ----------
  app.post('/api/admin/departures', adminOnly, wrap(async (req, res) => {
    const packageId = parseInt(req.body.package_id, 10);
    const seats = parseInt(req.body.seats_total, 10);
    const date = String(req.body.departure_date || '');
    if (!packageId || !(seats > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'package_id, departure_date (YYYY-MM-DD) and seats_total (> 0) are required' });
    try {
      const [r] = await db.query(
        'INSERT INTO package_departures (package_id, departure_date, seats_total) VALUES (?,?,?)',
        [packageId, date, seats]);
      res.json({ departure_id: r.insertId });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This package already has a departure on that date' });
      if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'Package not found' });
      throw e;
    }
  }));

  // ---------- ADMIN: change total seats (the CHECK constraint stops going below booked seats) ----------
  app.patch('/api/admin/departures/:id', adminOnly, wrap(async (req, res) => {
    const seats = parseInt(req.body.seats_total, 10);
    if (!(seats > 0)) return res.status(400).json({ error: 'seats_total must be greater than 0' });
    try {
      const [r] = await db.query('UPDATE package_departures SET seats_total = ? WHERE departure_id = ?', [seats, req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: 'Departure not found' });
      res.json({ message: 'Updated' });
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED')
        return res.status(400).json({ error: 'Total seats cannot be less than the seats already booked' });
      throw e;
    }
  }));
};
