/* TripNest - My Trips: trips, bookings (+ Pay), saved destinations */
(function () {
  let user = null; try { user = JSON.parse(localStorage.getItem('tripnest_user')); } catch (e) {}
  if (!user || !user.token) { localStorage.removeItem('tripnest_user'); location.href = 'login.html'; return; }
  const H = { 'x-auth-token': user.token, 'Content-Type': 'application/json' };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (d) => (d ? String(d).slice(0, 10) : '—');
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
  const fail = (box) => (box.innerHTML = '<p class="err">Backend connect kaaledu. Server run chesi refresh cheyandi.</p>');
  const logout = (e) => {
    e.preventDefault();
    fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': user.token }, keepalive: true }).catch(() => {});
    localStorage.removeItem('tripnest_user'); location.href = 'index.html';
  };

  $('hello').textContent = user.name.split(' ')[0] + "'s Trips";
  $('logoutLink').addEventListener('click', logout);

  async function get(path) {
    const res = await fetch(path, { headers: H });
    if (res.status === 401) { localStorage.removeItem('tripnest_user'); location.href = 'login.html'; throw new Error('401'); }
    if (!res.ok) throw new Error('Server error ' + res.status);
    return res.json();
  }

  async function loadTrips() {
    const box = $('tripsBox');
    try {
      const rows = await get(`/api/users/${user.user_id}/trips`);
      if (!rows.length) return (box.innerHTML = '<p class="empty">Inka trips levu. <a href="plan-trip.html">Plan a trip</a></p>');
      box.innerHTML = `<table><tr><th>Destination</th><th>Hotel</th><th>Package</th><th>Dates</th><th>Days</th><th>Travelers</th><th>Budget</th><th>Status</th><th></th></tr>` +
        rows.map((t) => `<tr><td>${esc(t.destination)}, ${esc(t.country)}</td><td>${esc(t.hotel)}</td><td>${esc(t.package_name)}</td>
          <td>${day(t.start_date)} → ${day(t.end_date)}</td><td>${esc(t.duration_days)}</td><td>${esc(t.travelers)}</td>
          <td>$${esc(t.budget)}</td><td>${badge(t.status)}${t.booking_status ? `<div class="sub">Booking: ${esc(t.booking_status)}</div>` : ''}</td>
          <td class="acts">${tripActions(t)}</td></tr>`).join('') + '</table>';
      box.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this trip?')) return;
        const res = await fetch('/api/trips/' + b.dataset.id, { method: 'DELETE', headers: H });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not delete the trip'); }
        loadTrips();
      }));
      box.querySelectorAll('.book').forEach((b) => b.addEventListener('click', () => openBook(b.dataset)));

      // coming from the planner: /my-trips.html?book=<trip id> opens the booking window for that trip
      const want = new URLSearchParams(location.search).get('book');
      if (want) {
        const btn = box.querySelector(`.book[data-id="${Number(want)}"]`);
        history.replaceState(null, '', 'my-trips.html');
        if (btn) openBook(btn.dataset);
      }
    } catch (e) { if (e.message !== '401') fail(box); }
  }

  // a trip with a package can be booked; a stay-only trip cannot; a booked trip points to its booking
  function tripActions(t) {
    if (t.booking_id) return '<span class="sub">Booked (see Package Bookings)</span>';
    let h = t.package_id
      ? `<button class="book" data-id="${t.trip_id}" data-pkgid="${t.package_id}" data-pkg="${esc(t.package_name)}" data-dest="${esc(t.destination)}" data-trav="${esc(t.travelers)}">Book this trip</button>`
      : '<span class="sub">Stay only</span> ';
    return h + `<button class="del" data-id="${t.trip_id}">Delete</button>`;
  }

  // ---------- Book a planned trip: choose a departure, seats are held for 30 minutes ----------
  let bookTrip = null, bookDeps = [];
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  function refreshBook() {
    const d = bookDeps.find((x) => String(x.departure_id) === $('bookDep').value);
    const n = parseInt($('bookTrav').value, 10) || 0;
    $('bookGo').disabled = true;
    if (!d) { $('bookSeats').textContent = ''; return; }
    if (n < 1 || n > 10) { $('bookSeats').textContent = 'Travelers must be between 1 and 10.'; return; }
    if (n > d.seats_left) { $('bookSeats').textContent = 'Only ' + d.seats_left + ' seat(s) left on this date.'; return; }
    $('bookSeats').textContent = d.seats_left + ' of ' + d.seats_total + ' seats left · Total $' + (Number(d.price) * n).toLocaleString();
    $('bookGo').disabled = false;
  }
  async function loadBookDepartures() {
    $('bookGo').disabled = true; $('bookSeats').textContent = '';
    $('bookDep').innerHTML = '<option value="">Loading departures...</option>';
    try { bookDeps = await get('/api/departures?package_id=' + bookTrip.pkgid); }
    catch (e) { $('bookDep').innerHTML = '<option value="">Could not load departures</option>'; return; }
    if (!bookDeps.length) { $('bookDep').innerHTML = '<option value="">No open departures</option>'; $('bookMsg').className = 'bad'; $('bookMsg').textContent = 'There are no open departures for this package yet.'; return; }
    $('bookDep').innerHTML = '<option value="">Choose a departure date</option>' + bookDeps.map((d) =>
      `<option value="${d.departure_id}"${d.seats_left === 0 ? ' disabled' : ''}>${fmtDate(d.departure_date)} — ${d.seats_left === 0 ? 'Sold out' : d.seats_left + ' seats left'}</option>`).join('');
  }
  function openBook(d) {
    bookTrip = d;
    $('bookInfo').textContent = `${d.pkg} · ${d.dest}`;
    $('bookTrav').value = Math.min(Math.max(parseInt(d.trav, 10) || 1, 1), 10);
    $('bookMsg').textContent = ''; $('bookMsg').className = '';
    $('bookModal').hidden = false;
    loadBookDepartures();
  }
  const closeBook = () => ($('bookModal').hidden = true);
  $('bookBack').addEventListener('click', closeBook);
  $('bookModal').addEventListener('click', (e) => { if (e.target.id === 'bookModal') closeBook(); });
  $('bookDep').addEventListener('change', refreshBook);
  $('bookTrav').addEventListener('input', refreshBook);
  $('bookGo').addEventListener('click', async () => {
    $('bookGo').disabled = true; $('bookMsg').className = ''; $('bookMsg').textContent = 'Reserving...';
    try {
      const res = await fetch(`/api/trips/${bookTrip.id}/book`, { method: 'POST', headers: H,
        body: JSON.stringify({ departure_id: Number($('bookDep').value), travelers: Number($('bookTrav').value) }) });
      const d = await res.json();
      if (res.status === 401) { localStorage.removeItem('tripnest_user'); location.href = 'login.html'; return; }
      if (!res.ok) throw new Error(d.error || 'Could not book this trip');
      $('bookMsg').className = 'ok';
      $('bookMsg').textContent = `Seats held for ${d.hold_minutes} minutes. Pay below to confirm your trip.`;
      setTimeout(() => { closeBook(); loadTrips(); loadBookings(); }, 1600);
    } catch (e) { $('bookMsg').className = 'bad'; $('bookMsg').textContent = e.message; loadBookDepartures(); }
  });

  async function loadBookings() {
    const box = $('bookingsBox');
    try {
      const rows = await get(`/api/users/${user.user_id}/bookings`);
      if (!rows.length) return (box.innerHTML = '<p class="empty">Inka bookings levu. <a href="packages.html">Packages chudandi</a></p>');
      box.innerHTML = `<table><tr><th>Package</th><th>Travel Date</th><th>Travelers</th><th>Total</th><th>Status</th><th></th></tr>` +
        rows.map((b) => `<tr><td>${esc(b.package_name)}</td><td>${day(b.travel_date)}</td><td>${esc(b.travelers)}</td><td>$${esc(b.total_price)}</td><td>${badge(b.status)}${b.hold_minutes_left !== null && b.hold_minutes_left !== undefined ? `<div class="hold">Pay within ${b.hold_minutes_left > 0 ? b.hold_minutes_left + ' min' : '1 min'} or the seats are released</div>` : ''}</td>
          <td class="acts">${actions(b)}</td></tr>`).join('') + '</table>';
      box.querySelectorAll('.pay').forEach((b) => b.addEventListener('click', () => openPay(b.dataset)));
      box.querySelectorAll('.cancel').forEach((b) => b.addEventListener('click', () => openCancel(b.dataset)));
    } catch (e) { if (e.message !== '401') fail(box); }
  }

  async function loadWishlist() {
    const box = $('wishBox');
    try {
      const rows = await get('/api/wishlist');
      if (!rows.length) return (box.innerHTML = '<p class="empty">Inka em save cheyaledu. <a href="destinations.html">Destinations lo ♥ click cheyandi</a></p>');
      box.innerHTML = '<div class="chips">' + rows.map((d) => `<span class="chip">${esc(d.name)}, ${esc(d.country)} · $${esc(d.price)} <button data-n="${esc(d.name)}" title="Remove">×</button></span>`).join('') + '</div>';
      box.querySelectorAll('.chip button').forEach((b) => b.addEventListener('click', async () => {
        await fetch('/api/wishlist/toggle', { method: 'POST', headers: H, body: JSON.stringify({ dest_name: b.dataset.n }) }); loadWishlist();
      }));
    } catch (e) { if (e.message !== '401') fail(box); }
  }

  // ---------- Cancel booking + refund history ----------
  const daysTo = (d) => { const t = new Date(day(d) + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); };
  const pctFor = (days) => (days >= 7 ? 100 : days >= 2 ? 50 : 0);
  function actions(b) {
    let h = '';
    if (b.status === 'pending') h += `<button class="pay" data-id="${b.booking_id}" data-amt="${esc(b.total_price)}" data-pkg="${esc(b.package_name)}">Pay now</button>`;
    else if (b.status === 'confirmed') h += '<span class="paid">Paid ✓</span>';
    if (b.status !== 'cancelled' && daysTo(b.travel_date) >= 0)
      h += `<button class="cancel" data-id="${b.booking_id}" data-amt="${esc(b.total_price)}" data-pkg="${esc(b.package_name)}" data-status="${esc(b.status)}" data-date="${day(b.travel_date)}">Cancel</button>`;
    return h;
  }
  let cancelId = null;
  function openCancel(d) {
    cancelId = d.id;
    $('cancelInfo').textContent = `${d.pkg} (travel date ${d.date})`;
    const paid = d.status === 'confirmed', pct = paid ? pctFor(daysTo(d.date)) : 0;
    $('cancelEst').textContent = paid ? `If you cancel now: ${pct}% refund = $${(Number(d.amt) * pct / 100).toFixed(2)}` : 'This booking is not paid yet, so no refund is needed.';
    $('cancelMsg').textContent = ''; $('cancelMsg').className = ''; $('cancelGo').disabled = false; $('cancelModal').hidden = false;
  }
  const closeCancel = () => ($('cancelModal').hidden = true);
  $('cancelBack').addEventListener('click', closeCancel);
  $('cancelModal').addEventListener('click', (e) => { if (e.target.id === 'cancelModal') closeCancel(); });
  $('cancelGo').addEventListener('click', async () => {
    $('cancelGo').disabled = true; $('cancelMsg').className = ''; $('cancelMsg').textContent = 'Cancelling…';
    try {
      const res = await fetch(`/api/bookings/${cancelId}/cancel`, { method: 'POST', headers: H, body: JSON.stringify({ reason: $('cancelReason').value }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Could not cancel');
      $('cancelMsg').className = 'ok';
      $('cancelMsg').textContent = Number(d.refund_amount) > 0 ? `Booking cancelled. Refund of $${Number(d.refund_amount).toFixed(2)} (${d.refund_percent}%) recorded.` : 'Booking cancelled. No refund applies.';
      setTimeout(() => { closeCancel(); loadBookings(); loadRefunds(); }, 1800);
    } catch (e) { $('cancelMsg').className = 'bad'; $('cancelMsg').textContent = e.message; $('cancelGo').disabled = false; }
  });

  async function loadRefunds() {
    const box = $('refundBox');
    try {
      const rows = await get('/api/refunds');
      if (!rows.length) return (box.innerHTML = '<p class="empty">Inka refunds levu.</p>');
      box.innerHTML = `<table><tr><th>Package</th><th>Refund</th><th>%</th><th>Reference</th><th>Date</th><th>Status</th></tr>` +
        rows.map((r) => `<tr><td>${esc(r.package_name)}</td><td>$${esc(r.amount)}</td><td>${esc(r.percent_refunded)}%</td><td>${esc(r.refund_ref)}</td><td>${day(r.refunded_at)}</td><td>${badge(r.status)}</td></tr>`).join('') + '</table>';
    } catch (e) { if (e.message !== '401') fail(box); }
  }

  // ---------- Pay modal (simulated payment) ----------
  let payId = null;
  function openPay(d) {
    payId = d.id; $('payInfo').textContent = `${d.pkg}: $${d.amt}`; $('payMsg').textContent = ''; $('payMsg').className = '';
    $('payGo').disabled = false; $('payModal').hidden = false;
  }
  const closePay = () => ($('payModal').hidden = true);
  $('payCancel').addEventListener('click', closePay);
  $('payModal').addEventListener('click', (e) => { if (e.target.id === 'payModal') closePay(); });
  $('payGo').addEventListener('click', async () => {
    const method = document.querySelector('input[name="pm"]:checked').value;
    $('payGo').disabled = true; $('payMsg').className = ''; $('payMsg').textContent = 'Processing…';
    try {
      const res = await fetch('/api/pay', { method: 'POST', headers: H, body: JSON.stringify({ booking_id: payId, method }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Payment failed');
      $('payMsg').className = 'ok'; $('payMsg').textContent = `Payment successful. Ref ${d.txn_ref}. Confirmation email saved.`;
      setTimeout(() => { closePay(); loadBookings(); }, 1800);
    } catch (e) { $('payMsg').className = 'bad'; $('payMsg').textContent = e.message; $('payGo').disabled = false; }
  });

  loadTrips(); loadBookings(); loadRefunds(); loadWishlist();
})();
