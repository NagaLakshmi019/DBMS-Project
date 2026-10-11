/* TripNest - Admin dashboard (data database nunchi, admin key tho protected) */
(function () {
  const API = '';
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (d) => (d ? String(d).slice(0, 10) : '—');

  async function api(path, method = 'GET', body) {
    let u = null; try { u = JSON.parse(localStorage.getItem('tripnest_user')); } catch (e) {}
    const deny = () => { alert('Admin login required.'); location.href = 'login.html'; throw new Error('not admin'); };
    if (!u || u.role !== 'admin' || !u.token) deny();
    const res = await fetch(API + path, {
      method, headers: { 'Content-Type': 'application/json', 'x-auth-token': u.token },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 || res.status === 403) { localStorage.removeItem('tripnest_user'); deny(); } // session expired or not an admin
    if (res.status === 401 || res.status === 403) { localStorage.removeItem('tripnest_user'); deny(); }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Server error ' + res.status); }
    return res.json();
  }

  const table = (heads, rows) => rows.length
    ? `<table><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table>`
    : '<p class="empty">Data ledu.</p>';

  const views = {
    users: async () => table(['ID', 'Name', 'Email', 'Phone', 'Country', 'Joined'],
      (await api('/api/admin/users')).map((u) => `<tr><td>${u.user_id}</td><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td>${esc(u.country)}</td><td>${day(u.created_at)}</td></tr>`)),
    trips: async () => table(['ID', 'User', 'Destination', 'Hotel', 'Tier', 'Dates', 'Travelers', 'Budget', 'Status'],
      (await api('/api/admin/trips')).map((t) => `<tr><td>${t.trip_id}</td><td>${esc(t.full_name)}</td><td>${esc(t.destination)}</td><td>${esc(t.hotel)}</td><td>${esc(t.package_name)}</td><td>${day(t.start_date)} → ${day(t.end_date)}</td><td>${esc(t.travelers)}</td><td>$${esc(t.budget)}</td><td>${esc(t.status)}</td></tr>`)),
    bookings: async () => table(['ID', 'User', 'Package', 'Travel Date', 'Travelers', 'Total', 'Status', 'Action'],
      (await api('/api/admin/bookings')).map((b) => `<tr><td>${b.booking_id}</td><td>${esc(b.full_name)}</td><td>${esc(b.package_name)}</td><td>${day(b.travel_date)}</td><td>${esc(b.travelers)}</td><td>$${esc(b.total_price)}</td>
        <td>${esc(b.status)}</td><td>${b.status === 'cancelled' ? '—' : `<button class="cancelBk" data-id="${b.booking_id}">Cancel booking</button>`}</td></tr>`)),
    payments: async () => table(['ID', 'User', 'Booking', 'Amount', 'Method', 'Status', 'Reference', 'Paid at'],
      (await api('/api/admin/payments')).map((p) => `<tr><td>${p.payment_id}</td><td>${esc(p.full_name)}</td><td>#${p.booking_id}</td><td>$${esc(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.status)}</td><td>${esc(p.txn_ref)}</td><td>${day(p.paid_at)}</td></tr>`)),
    emails: async () => table(['ID', 'To', 'Subject', 'Message', 'Status', 'Date'],
      (await api('/api/admin/emails')).map((m) => `<tr><td>${m.email_id}</td><td>${esc(m.to_email)}</td><td>${esc(m.subject)}</td><td style="white-space:normal;min-width:240px">${esc(m.body)}</td><td>${esc(m.status)}</td><td>${day(m.created_at)}</td></tr>`)),
    refunds: async () => table(['ID', 'User', 'Package', 'Booking', 'Refund', '%', 'Reference', 'Status', 'Date'],
      (await api('/api/admin/refunds')).map((r) => `<tr><td>${r.refund_id}</td><td>${esc(r.full_name)}</td><td>${esc(r.package_name)}</td><td>#${r.booking_id}</td><td>$${esc(r.amount)}</td><td>${esc(r.percent_refunded)}%</td><td>${esc(r.refund_ref)}</td><td>${esc(r.status)}</td><td>${day(r.refunded_at)}</td></tr>`)),
    stays: async () => table(['ID', 'Guest', 'Hotel', 'Room', 'Stay', 'Rooms', 'Total', 'Status', 'Action'],
      (await api('/api/admin/hotel-bookings')).map((s) => `<tr><td>${s.hotel_booking_id}</td><td>${esc(s.full_name)}</td><td>${esc(s.hotel)}</td><td>${esc(s.room)}</td>
        <td>${day(s.check_in)} → ${day(s.check_out)}</td><td>${esc(s.rooms_count)}</td><td>$${esc(s.total_price)}</td><td>${esc(s.status)}</td>
        <td>${s.status === 'cancelled' ? '—' : `<button class="cancelStay" data-id="${s.hotel_booking_id}">Cancel stay</button>`}</td></tr>`)),
    seats: async () => {
      const [deps, pkgs] = await Promise.all([api('/api/admin/departures'), fetch('/api/packages').then((r) => r.json())]);
      const form = `<form id="depForm" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;align-items:center">
        <select name="package_id" required>${pkgs.map((p) => `<option value="${p.package_id}">${esc(p.name)}</option>`).join('')}</select>
        <input type="date" name="departure_date" required>
        <input type="number" name="seats_total" min="1" value="10" required style="width:90px" title="Total seats">
        <button type="submit">Add departure</button> <span id="depMsg" class="err"></span></form>`;
      const badge = { sold_out: '#DC2626', filling_fast: '#D97706', available: '#15803D' };
      return form + table(['ID', 'Package', 'Date', 'Total', 'Booked', 'Left', 'Occupancy', 'Status'],
        deps.map((d) => `<tr><td>${d.departure_id}</td><td>${esc(d.package_name)}</td><td>${day(d.departure_date)}</td>
          <td><input type="number" class="seatsTotal" data-id="${d.departure_id}" value="${d.seats_total}" min="1" style="width:70px"></td>
          <td>${esc(d.seats_booked)}</td><td>${esc(d.seats_left)}</td>
          <td><div style="background:#E5E7EB;border-radius:6px;height:8px;width:90px"><div style="background:${badge[d.availability]};height:8px;border-radius:6px;width:${Number(d.occupancy_pct)}%"></div></div> ${esc(d.occupancy_pct)}%</td>
          <td style="color:${badge[d.availability]};font-weight:600">${esc(d.availability.replace('_', ' '))}</td></tr>`));
    },
    messages: async () => table(['ID', 'Name', 'Email', 'Subject', 'Message', 'Date'],
      (await api('/api/admin/messages')).map((m) => `<tr><td>${m.msg_id}</td><td>${esc(m.full_name)}</td><td>${esc(m.email)}</td><td>${esc(m.subject)}</td><td style="white-space:normal;min-width:240px">${esc(m.message)}</td><td>${day(m.created_at)}</td></tr>`)),
  };

  async function show(name) {
    const panel = document.getElementById('panel');
    panel.textContent = 'Loading…';
    try {
      panel.innerHTML = await views[name]();
      panel.querySelectorAll('button.cancelBk').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('Cancel booking #' + btn.dataset.id + '? Seats are released and the refund policy is applied.')) return;
        try { await api('/api/admin/bookings/' + btn.dataset.id, 'PATCH', { status: 'cancelled' }); loadStats(); show('bookings'); }
        catch (err) { alert(err.message); }
      }));
      panel.querySelectorAll('button.cancelStay').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('Cancel stay #' + btn.dataset.id + '? The refund follows the room cancellation policy.')) return;
        try { await api('/api/admin/hotel-bookings/' + btn.dataset.id, 'PATCH', { status: 'cancelled' }); show('stays'); }
        catch (err) { alert(err.message); }
      }));
      const depForm = panel.querySelector('#depForm');
      if (depForm) depForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = new FormData(depForm);
        try {
          await api('/api/admin/departures', 'POST', { package_id: f.get('package_id'), departure_date: f.get('departure_date'), seats_total: f.get('seats_total') });
          show('seats');
        } catch (err) { panel.querySelector('#depMsg').textContent = err.message; }
      });
      panel.querySelectorAll('input.seatsTotal').forEach((i) => i.addEventListener('change', async () => {
        try { await api('/api/admin/departures/' + i.dataset.id, 'PATCH', { seats_total: i.value }); show('seats'); }
        catch (err) { alert(err.message); show('seats'); }
      }));
    } catch (e) { panel.innerHTML = '<p class="err">Backend connect kaaledu. Server run chesi refresh cheyandi.</p>'; }
  }

  async function loadStats() {
    try {
      const s = await api('/api/admin/stats');
      document.getElementById('stats').innerHTML = [['Users', s.users], ['Trips', s.trips], ['Bookings', s.bookings], ['Revenue', '$' + Number(s.revenue).toLocaleString()]]
        .map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    } catch (e) {}
  }

  document.getElementById('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === b));
    show(b.dataset.t);
  });
  document.getElementById('adminLogout').addEventListener('click', (e) => {
    e.preventDefault();
    let u = null; try { u = JSON.parse(localStorage.getItem('tripnest_user')); } catch (err) {}
    if (u && u.token) fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': u.token }, keepalive: true }).catch(() => {});
    localStorage.removeItem('tripnest_user'); location.href = 'index.html';
  });
  loadStats(); show('users');
})();
