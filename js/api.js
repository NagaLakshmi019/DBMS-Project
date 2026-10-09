/**
 * TripNest - API helper + form wiring (register, contact)
 * Server same origin nunchi serve avthundi kabatti API = '' (relative URLs).
 * Frontend ni separate ga (Live Server) run chesthe: const API = 'http://localhost:3000';
 */
const API = '';

async function apiCall(path, method = 'GET', body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function currentUser() {
  try { return JSON.parse(localStorage.getItem('tripnest_user')); } catch { return null; }
}

document.addEventListener('DOMContentLoaded', () => {
  // ---------- CONTACT ----------
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = (id) => document.getElementById(id).value.trim();
      try {
        await apiCall('/api/contact', 'POST', {
          fullname: f('fullname'), email: f('email'), phone: f('phone'),
          subject: f('subject'), message: f('message')
        });
        alert('Thanks! Your message has been sent.');
        contactForm.reset();
      } catch (err) {
        alert(err.message);
      }
    });
  }
});

/* ============================================================
   PLAN-TRIP + PACKAGES BOOKING
   Mee plan-trip.js / packages.js ni touch cheyakunda, DOM nunchi values chaduvutham.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  function requireLogin() {
    const user = currentUser();
    if (!user) {
      alert('Please login first.');
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }

  // ---------- plan-trip.html: "Complete My Trip" ----------
  const finishBtn = document.getElementById('finishBtn');
  if (finishBtn) {
    const picked = (group) =>
      document.querySelector(`.pt-option-grid[data-group="${group}"] .pt-option-card.is-selected`);

    finishBtn.addEventListener('click', async () => {
      const user = currentUser();
      if (!user) return requireLogin();
      const dest = picked('destination');
      const hotel = picked('hotel');
      const pkg = picked('package');
      const start = document.getElementById('startDate').value;
      const end = document.getElementById('endDate').value;
      if (!dest || !start || !end) return; // frontend already validates required steps
      try {
        await apiCall('/api/plan-trip', 'POST', {
          destination: dest.dataset.value,
          hotel: hotel ? hotel.dataset.value : null,
          hotel_price: hotel ? hotel.dataset.price : null,
          package_tier: pkg ? pkg.dataset.value : null,
          travelers: document.getElementById('travelers').value,
          budget: Number(document.getElementById('budgetSlider').value),
          start_date: start,
          end_date: end
        }, user.token);
      } catch (err) {
        if (err.message === 'Please login') { localStorage.removeItem('tripnest_user'); return requireLogin(); }
        alert('Could not save your trip: ' + err.message);
      }
    });
  }

  // ---------- packages.html: booking modal (choose departure -> seats are reserved in the database) ----------
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    const sel = document.getElementById('departureSelect');
    const trav = document.getElementById('bkTravelers');
    const info = document.getElementById('seatInfo');
    const msg = document.getElementById('bkMsg');
    const btn = document.getElementById('bkSubmit');
    let deps = [];
    let currentPackage = '';

    const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const setMsg = (text, kind) => { msg.textContent = text; msg.className = 'bk-msg ' + (kind || ''); };

    // enable the button only when a departure is chosen and enough seats are left
    function refreshInfo() {
      const d = deps.find((x) => String(x.departure_id) === sel.value);
      info.className = 'seat-info';
      btn.disabled = true;
      if (!d) { info.textContent = ''; return; }
      const n = parseInt(trav.value, 10) || 0;
      if (n < 1 || n > 10) { info.textContent = 'Travelers must be between 1 and 10.'; info.className = 'seat-info warn'; return; }
      if (n > d.seats_left) { info.textContent = 'Only ' + d.seats_left + ' seat(s) left on this date.'; info.className = 'seat-info warn'; return; }
      info.textContent = d.seats_left + ' of ' + d.seats_total + ' seats left \u00b7 Total $' + (Number(d.price) * n).toLocaleString();
      if (d.seats_left <= 3) info.className = 'seat-info warn';
      btn.disabled = false;
    }

    async function loadDepartures() {
      deps = [];
      btn.disabled = true;
      info.textContent = '';
      sel.innerHTML = '<option value="">Loading departures...</option>';
      try {
        deps = await apiCall('/api/departures?package_name=' + encodeURIComponent(currentPackage));
      } catch (err) {
        sel.innerHTML = '<option value="">Could not load departures</option>';
        return setMsg('Server is not reachable. Please start the backend and refresh.', 'err');
      }
      if (!deps.length) {
        sel.innerHTML = '<option value="">No open departures</option>';
        return setMsg('There are no open departures for this package yet. Please contact us for a custom quote.', 'warn');
      }
      sel.innerHTML = '<option value="">Choose a departure date</option>' + deps.map((d) =>
        '<option value="' + d.departure_id + '"' + (d.seats_left === 0 ? ' disabled' : '') + '>' +
        fmt(d.departure_date) + ' \u2014 ' + (d.seats_left === 0 ? 'Sold out' : d.seats_left + ' seats left') + '</option>').join('');
    }

    // packages.js fires this every time the modal opens
    document.addEventListener('booking:open', (e) => {
      currentPackage = e.detail.packageName;
      setMsg('');
      trav.value = 1;
      loadDepartures();
    });
    sel.addEventListener('change', refreshInfo);
    trav.addEventListener('input', refreshInfo);

    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = currentUser();
      if (!user || !user.token) return requireLogin();
      btn.disabled = true;
      setMsg('Reserving your seats...');
      try {
        const r = await apiCall('/api/book', 'POST',
          { departure_id: Number(sel.value), travelers: Number(trav.value) }, user.token);
        msg.className = 'bk-msg ok';
        msg.textContent = 'Reserved ' + r.travelers + ' seat(s) for ' + fmt(r.travel_date) + '. Total $' +
          Number(r.total_price).toLocaleString() + ' (' + r.seats_left + ' seats left on this date). Pay within 30 minutes to keep them. ';
        const link = document.createElement('a');
        link.href = 'my-trips.html';
        link.textContent = 'Go to My Trips to pay';
        msg.appendChild(link);
        loadDepartures(); // refresh the seat counts
      } catch (err) {
        if (err.message === 'Please login') return requireLogin();
        setMsg(err.message, 'err');
        loadDepartures(); // someone else may have taken the seats; show fresh numbers
      }
    });
  }
});
