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
          <td>$${esc(t.budget)}</td><td>${badge(t.status)}</td><td><button class="del" data-id="${t.trip_id}">Delete</button></td></tr>`).join('') + '</table>';
      box.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Ee trip delete cheyala?')) return;
        await fetch('/api/trips/' + b.dataset.id, { method: 'DELETE', headers: H }); loadTrips();
      }));
    } catch (e) { if (e.message !== '401') fail(box); }
  }

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
