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
          <td>$${esc(t.budget)}</td><td>${badge(t.status)}${t.booking_status ? `<div class="sub">Booking: ${esc(t.booking_status)}</div>` : t.stay_status ? `<div class="sub">Stay: ${esc(t.stay_status)}</div>` : ''}</td>
          <td class="acts">${tripActions(t)}</td></tr>`).join('') + '</table>';
      box.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this trip?')) return;
        const res = await fetch('/api/trips/' + b.dataset.id, { method: 'DELETE', headers: H });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not delete the trip'); }
        loadTrips();
      }));
      box.querySelectorAll('.book').forEach((b) => b.addEventListener('click', () => openBook(b.dataset)));
      box.querySelectorAll('.bookstay').forEach((b) => b.addEventListener('click', () => openStay(b.dataset)));

      // coming from the planner: /my-trips.html?book=<trip id> opens the booking window for that trip
      const q = new URLSearchParams(location.search);
      const want = q.get('book'), wantStay = q.get('stay');
      if (want || wantStay) {
        const btn = want ? box.querySelector(`.book[data-id="${Number(want)}"]`) : box.querySelector(`.bookstay[data-id="${Number(wantStay)}"]`);
        history.replaceState(null, '', 'my-trips.html');
        if (btn) (want ? openBook : openStay)(btn.dataset);
      }
    } catch (e) { if (e.message !== '401') fail(box); }
  }

  // a trip with a package can be booked; a stay-only trip books its hotel; a booked trip points to its booking
  function tripActions(t) {
    if (t.booking_id) return '<span class="sub">Booked (see Package Bookings)</span>';
    if (t.stay_id) return '<span class="sub">Booked (see Hotel Stays)</span>';
    let h;
    if (t.package_id) h = `<button class="book" data-id="${t.trip_id}" data-pkgid="${t.package_id}" data-pkg="${esc(t.package_name)}" data-dest="${esc(t.destination)}" data-trav="${esc(t.travelers)}">Book this trip</button>`;
    else if (t.hotel_id) h = `<button class="bookstay" data-id="${t.trip_id}" data-hotel="${t.hotel_id}" data-name="${esc(t.hotel)}" data-in="${day(t.start_date)}" data-out="${day(t.end_date)}" data-trav="${esc(t.travelers)}">Book the stay</button>`;
    else h = '<span class="sub">No package or hotel</span> ';
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

  // ---------- Book the hotel stay of a stay-only trip (dates come from the trip, availability is per night) ----------
  let stayTrip = null, stayRooms = [];
  function refreshStay() {
    const r = stayRooms.find((x) => String(x.room_id) === $('stayRoom').value);
    const guests = parseInt($('stayGuests').value, 10) || 0;
    $('stayGo').disabled = true;
    if (!r) { $('stayEst').textContent = ''; return; }
    const rooms = Math.ceil(guests / r.max_guests);
    if (guests < 1) { $('stayEst').textContent = 'Please enter the number of guests.'; return; }
    if (rooms > 5) { $('stayEst').textContent = 'That many guests need more than 5 rooms. Please book in parts.'; return; }
    if (rooms > r.available) { $('stayEst').textContent = r.available > 0 ? `Only ${r.available} room(s) left for these dates, but ${guests} guest(s) need ${rooms}.` : 'Sold out for these dates.'; return; }
    const nights = Math.round((new Date(stayTrip.out) - new Date(stayTrip.in)) / 864e5);
    const sub = r.price * nights * rooms;
    $('stayEst').textContent = `${rooms} room${rooms > 1 ? 's' : ''} × ${nights} night${nights > 1 ? 's' : ''} · ${r.available} available · Total $${(sub * 1.12).toFixed(2)} (incl. 12% tax)`;
    $('stayGo').disabled = false;
  }
  async function loadStayRooms() {
    $('stayGo').disabled = true; $('stayEst').textContent = '';
    $('stayRoom').innerHTML = '<option value="">Loading rooms...</option>';
    try { stayRooms = await get(`/api/hotels/${stayTrip.hotel}/availability?check_in=${stayTrip.in}&check_out=${stayTrip.out}`); }
    catch (e) {
      $('stayRoom').innerHTML = '<option value="">Rooms not available</option>';
      $('stayMsg').className = 'bad'; $('stayMsg').textContent = 'Could not load rooms for these dates. Trip dates must be in the future.'; return;
    }
    $('stayRoom').innerHTML = stayRooms.map((r) => `<option value="${r.room_id}"${r.available === 0 ? ' disabled' : ''}>${esc(r.name)} — $${r.price}/night · ${r.available === 0 ? 'sold out' : r.available + ' left'}</option>`).join('');
    const first = stayRooms.find((r) => r.available > 0);
    if (first) $('stayRoom').value = first.room_id;
    refreshStay();
  }
  function openStay(d) {
    stayTrip = d;
    $('stayInfo').textContent = `${d.name} · ${d.in} → ${d.out}`;
    $('stayGuests').value = Math.min(Math.max(parseInt(d.trav, 10) || 1, 1), 20);
    $('stayMsg').textContent = ''; $('stayMsg').className = '';
    $('stayModal').hidden = false;
    loadStayRooms();
  }
  const closeStay = () => ($('stayModal').hidden = true);
  $('stayBack').addEventListener('click', closeStay);
  $('stayModal').addEventListener('click', (e) => { if (e.target.id === 'stayModal') closeStay(); });
  $('stayRoom').addEventListener('change', refreshStay);
  $('stayGuests').addEventListener('input', refreshStay);
  $('stayGo').addEventListener('click', async () => {
    const r = stayRooms.find((x) => String(x.room_id) === $('stayRoom').value);
    const guests = parseInt($('stayGuests').value, 10);
    $('stayGo').disabled = true; $('stayMsg').className = ''; $('stayMsg').textContent = 'Reserving...';
    try {
      const res = await fetch(`/api/trips/${stayTrip.id}/book-stay`, { method: 'POST', headers: H,
        body: JSON.stringify({ room_id: r.room_id, guests, rooms: Math.ceil(guests / r.max_guests) }) });
      const d = await res.json();
      if (res.status === 401) { localStorage.removeItem('tripnest_user'); location.href = 'login.html'; return; }
      if (!res.ok) throw new Error(d.error || 'Could not book the stay');
      $('stayMsg').className = 'ok';
      $('stayMsg').textContent = `Rooms held for ${d.hold_minutes} minutes. Pay below to confirm your stay.`;
      setTimeout(() => { closeStay(); loadTrips(); loadStays(); }, 1600);
    } catch (e) { $('stayMsg').className = 'bad'; $('stayMsg').textContent = e.message; loadStayRooms(); }
  });

  async function loadStays() {
    const box = $('staysBox');
    try {
      const rows = await get(`/api/users/${user.user_id}/hotel-bookings`);
      if (!rows.length) return (box.innerHTML = '<p class="empty">No hotel stays yet. <a href="hotels.html">Browse hotels</a> or plan a stay-only trip.</p>');
      box.innerHTML = `<table><tr><th>Hotel</th><th>Room</th><th>Stay</th><th>Guests</th><th>Total</th><th>Status</th><th></th></tr>` +
        rows.map((s) => `<tr><td>${esc(s.hotel)}</td><td>${esc(s.room)}${s.rooms_count > 1 ? ' × ' + esc(s.rooms_count) : ''}</td>
          <td>${day(s.check_in)} → ${day(s.check_out)} <div class="sub">${esc(s.nights)} night${s.nights == 1 ? '' : 's'}</div></td><td>${esc(s.guests)}</td><td>$${esc(s.total_price)}</td>
          <td>${badge(s.status)}${s.hold_minutes_left !== null && s.hold_minutes_left !== undefined ? `<div class="hold">Pay within ${s.hold_minutes_left > 0 ? s.hold_minutes_left + ' min' : '1 min'} or the rooms are released</div>` : ''}</td>
          <td class="acts">${stayActions(s)}</td></tr>`).join('') + '</table>';
      box.querySelectorAll('.pay').forEach((b) => b.addEventListener('click', () => openPay(b.dataset, 'stay')));
      box.querySelectorAll('.cancel').forEach((b) => b.addEventListener('click', () => openCancel(b.dataset, 'stay')));
    } catch (e) { if (e.message !== '401') fail(box); }
  }
  function stayActions(s) {
    let h = '';
    const label = `${s.hotel} (${s.room})`;
    if (s.status === 'pending') h += `<button class="pay" data-id="${s.hotel_booking_id}" data-amt="${esc(s.total_price)}" data-pkg="${esc(label)}">Pay now</button>`;
    else if (s.status === 'confirmed') h += '<span class="paid">Paid ✓</span>';
    if (s.status !== 'cancelled' && daysTo(s.check_in) >= 1)
      h += `<button class="cancel" data-id="${s.hotel_booking_id}" data-amt="${esc(s.total_price)}" data-pkg="${esc(label)}" data-status="${esc(s.status)}" data-date="${day(s.check_in)}" data-fch="${s.free_cancel_hours === null ? '' : esc(s.free_cancel_hours)}" data-policy="${esc(s.cancellation)}">Cancel</button>`;
    return h;
  }

  async function loadBookings() {
    const box = $('bookingsBox');
    try {
      const rows = await get(`/api/users/${user.user_id}/bookings`);
      if (!rows.length) return (box.innerHTML = '<p class="empty">Inka bookings levu. <a href="packages.html">Packages chudandi</a></p>');
      box.innerHTML = `<table><tr><th>Package</th><th>Travel Date</th><th>Travelers</th><th>Total</th><th>Status</th><th></th></tr>` +
        rows.map((b) => `<tr><td>${esc(b.package_name)}</td><td>${day(b.travel_date)}</td><td>${esc(b.travelers)}</td><td>$${esc(b.total_price)}</td><td>${badge(b.status)}${b.hold_minutes_left !== null && b.hold_minutes_left !== undefined ? `<div class="hold">Pay within ${b.hold_minutes_left > 0 ? b.hold_minutes_left + ' min' : '1 min'} or the seats are released</div>` : ''}</td>
          <td class="acts">${actions(b)}</td></tr>`).join('') + '</table>';
      box.querySelectorAll('.pay').forEach((b) => b.addEventListener('click', () => openPay(b.dataset, 'package')));
      box.querySelectorAll('.cancel').forEach((b) => b.addEventListener('click', () => openCancel(b.dataset, 'package')));
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
  let cancelId = null, cancelKind = 'package';
  const PACKAGE_POLICY = $('cancelPolicy').textContent;
  function openCancel(d, kind) {
    cancelId = d.id; cancelKind = kind || 'package';
    const stay = cancelKind === 'stay';
    $('cancelInfo').textContent = stay ? `${d.pkg} (check-in ${d.date})` : `${d.pkg} (travel date ${d.date})`;
    $('cancelPolicy').textContent = stay
      ? (d.fch === '' ? 'This room type is non-refundable once paid. Unpaid stays are simply released.' : `This room type has free cancellation until ${d.fch} hours before check-in (100% refund). After that it is non-refundable. Unpaid stays need no refund. (Refunds are simulated.)`)
      : PACKAGE_POLICY;
    const paid = d.status === 'confirmed';
    const hoursTo = (new Date(d.date + 'T00:00:00') - new Date()) / 36e5;
    const pct = !paid ? 0 : stay ? (d.fch !== '' && hoursTo >= Number(d.fch) ? 100 : 0) : pctFor(daysTo(d.date));
    $('cancelEst').textContent = paid ? `If you cancel now: ${pct}% refund = $${(Number(d.amt) * pct / 100).toFixed(2)}` : 'This booking is not paid yet, so no refund is needed.';
    $('cancelMsg').textContent = ''; $('cancelMsg').className = ''; $('cancelGo').disabled = false; $('cancelModal').hidden = false;
  }
  const closeCancel = () => ($('cancelModal').hidden = true);
  $('cancelBack').addEventListener('click', closeCancel);
  $('cancelModal').addEventListener('click', (e) => { if (e.target.id === 'cancelModal') closeCancel(); });
  $('cancelGo').addEventListener('click', async () => {
    $('cancelGo').disabled = true; $('cancelMsg').className = ''; $('cancelMsg').textContent = 'Cancelling…';
    try {
      const res = await fetch(cancelKind === 'stay' ? `/api/hotel-bookings/${cancelId}/cancel` : `/api/bookings/${cancelId}/cancel`, { method: 'POST', headers: H, body: JSON.stringify({ reason: $('cancelReason').value }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Could not cancel');
      $('cancelMsg').className = 'ok';
      $('cancelMsg').textContent = Number(d.refund_amount) > 0 ? `Booking cancelled. Refund of $${Number(d.refund_amount).toFixed(2)} (${d.refund_percent}%) recorded.` : 'Booking cancelled. No refund applies.';
      setTimeout(() => { closeCancel(); loadBookings(); loadStays(); loadTrips(); loadRefunds(); }, 1800);
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
  let payId = null, payKind = 'package';
  function openPay(d, kind) {
    payId = d.id; payKind = kind || 'package'; $('payInfo').textContent = `${d.pkg}: $${d.amt}`; $('payMsg').textContent = ''; $('payMsg').className = '';
    $('payGo').disabled = false; $('payModal').hidden = false;
  }
  const closePay = () => ($('payModal').hidden = true);
  $('payCancel').addEventListener('click', closePay);
  $('payModal').addEventListener('click', (e) => { if (e.target.id === 'payModal') closePay(); });
  $('payGo').addEventListener('click', async () => {
    const method = document.querySelector('input[name="pm"]:checked').value;
    $('payGo').disabled = true; $('payMsg').className = ''; $('payMsg').textContent = 'Processing…';
    try {
      const res = await fetch('/api/pay', { method: 'POST', headers: H, body: JSON.stringify(payKind === 'stay' ? { hotel_booking_id: payId, method } : { booking_id: payId, method }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Payment failed');
      $('payMsg').className = 'ok'; $('payMsg').textContent = `Payment successful. Ref ${d.txn_ref}. Confirmation email saved.`;
      setTimeout(() => { closePay(); loadBookings(); loadStays(); loadTrips(); }, 1800);
    } catch (e) { $('payMsg').className = 'bad'; $('payMsg').textContent = e.message; $('payGo').disabled = false; }
  });

  loadTrips(); loadBookings(); loadStays(); loadRefunds(); loadWishlist();
})();
