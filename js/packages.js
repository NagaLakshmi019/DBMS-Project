/* =========================================================
   TRIPNEST — PACKAGES PAGE SCRIPT
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- PAGE LOADER ---------- */
  const loader = document.getElementById('loader');
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hide'), 500);
  });
  setTimeout(() => loader.classList.add('hide'), 1800); // fallback

  /* ---------- CUSTOM CURSOR ---------- */
  const cursor = document.getElementById('cursor');
  const isTouch = window.matchMedia('(hover: none)').matches;

  if (!isTouch) {
    let mx = 0, my = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

    function animateCursor() {
      cx += (mx - cx) * 0.18;
      cy += (my - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    document.querySelectorAll('a, button, select, input, .cat-card, .pkg-card, .gallery-item, .pin').forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (el.matches('.cat-card, .pkg-card, .gallery-item, .pin')) cursor.classList.add('hover-card');
        else cursor.classList.add('hover-btn');
      });
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover-card', 'hover-btn'));
    });

    window.addEventListener('mousedown', () => cursor.classList.add('click'));
    window.addEventListener('mouseup', () => cursor.classList.remove('click'));
  }

  /* ---------- MAGNETIC BUTTONS ---------- */
  document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });

  /* ---------- RIPPLE EFFECT ---------- */
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const r = this.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = (e.clientX - r.left - 10) + 'px';
      ripple.style.top = (e.clientY - r.top - 10) + 'px';
      ripple.style.width = ripple.style.height = '20px';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  });

  /* ---------- NAVBAR SCROLL STATE ---------- */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  });

  /* ---------- SMOOTH SCROLL LINKS ---------- */
  document.querySelectorAll('[data-scroll]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(el.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* ---------- MOBILE NAV TOGGLE ---------- */
  document.getElementById('navToggle').addEventListener('click', function () {
    document.querySelector('.nav-links').classList.toggle('mobile-open');
    document.querySelector('.nav-actions').classList.toggle('mobile-open');
  });

  /* ---------- BACK TO TOP ---------- */
  document.getElementById('backToTop').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* =========================================================
     GSAP ANIMATIONS
     ========================================================= */
  if (window.gsap) {
    gsap.registerPlugin(ScrollTrigger);

    // Hero entrance timeline
    gsap.timeline({ delay: 0.3 })
      .to('.badge', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
      .to('.split-line', { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out' }, '-=0.4')
      .to('.hero-sub', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
      .to('.hero-cta', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
      .to('.hero-stats', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', onComplete: animateCounters }, '-=0.5')
      .to('.collage-card, .float-chip, .float-badge', { opacity: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.12, ease: 'back.out(1.4)' }, '-=0.9');

    gsap.set('.split-line, .hero-sub, .hero-cta, .hero-stats, .badge', { opacity: 0, y: 24 });
    gsap.set('.collage-card, .float-chip, .float-badge', { opacity: 0, scale: 0.85, y: 20 });

    // Generic scroll reveal for all .reveal-up elements outside hero
    document.querySelectorAll('.reveal-up').forEach(el => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    // Stagger cards within grids
    ['.category-grid', '.services-grid', '.compare-grid', '.offers-grid'].forEach(sel => {
      const grid = document.querySelector(sel);
      if (grid) {
        gsap.to(grid.children, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: grid, start: 'top 85%' }
        });
      }
    });

    // Parallax mouse movement on hero decor
    const heroSection = document.getElementById('hero');
    heroSection.addEventListener('mousemove', e => {
      const { innerWidth: w, innerHeight: h } = window;
      const px = (e.clientX - w / 2) / w;
      const py = (e.clientY - h / 2) / h;
      document.querySelectorAll('.parallax').forEach(el => {
        const depth = parseFloat(el.dataset.depth) || 0.05;
        gsap.to(el, { x: px * 100 * depth * 10, y: py * 100 * depth * 10, duration: 0.6, ease: 'power2.out' });
      });
    });

    // Timeline progress bar tied to scroll
    ScrollTrigger.create({
      trigger: '.timeline',
      start: 'top 60%',
      end: 'bottom 60%',
      onUpdate: self => {
        document.getElementById('timelineProgress').style.height = (self.progress * 100) + '%';
      }
    });
  }

  /* ---------- COUNTER ANIMATION ---------- */
  function animateCounters() {
    document.querySelectorAll('.stat-num').forEach(el => {
      const target = parseInt(el.dataset.count, 10);
      const obj = { val: 0 };
      if (window.gsap) {
        gsap.to(obj, {
          val: target, duration: 1.6, ease: 'power2.out',
          onUpdate: () => el.textContent = Math.round(obj.val)
        });
      } else {
        el.textContent = target;
      }
    });
  }

  /* =========================================================
     PACKAGE DATA + FEATURED PACKAGES RENDER
     ========================================================= */
  const packages = [
    { name: 'Santorini Sunset Escape', img: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&q=80', days: 7, countries: 1, rating: 4.9, price: 2450, tag: 'Best Seller', includes: ['Flights', 'Hotel', 'Meals'], category: 'beach' },
    { name: 'Swiss Alps Summit Trail', img: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600&q=80', days: 9, countries: 1, rating: 4.8, price: 3200, tag: 'Adventure', includes: ['Flights', 'Guide', 'Transfers'], category: 'mountain' },
    { name: 'Serengeti Safari Trail', img: 'https://images.unsplash.com/photo-1516426122078-c23e76319801?w=600&q=80', days: 6, countries: 2, rating: 4.9, price: 3400, tag: 'Wildlife', includes: ['Flights', 'Guide', 'Meals'], category: 'safari' },
    { name: 'Bali Wellness Retreat', img: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80', days: 8, countries: 1, rating: 4.7, price: 1320, tag: 'Relax', includes: ['Hotel', 'Meals', 'Spa'], category: 'honeymoon' },
    { name: 'Maldives Overwater Bliss', img: 'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=600&q=80', days: 5, countries: 1, rating: 5.0, price: 4100, tag: 'Luxury', includes: ['Flights', 'Villa', 'Meals'], category: 'luxury' },
    { name: 'Kyoto Cultural Journey', img: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80', days: 10, countries: 1, rating: 4.8, price: 2680, tag: 'Culture', includes: ['Flights', 'Guide', 'Hotel'], category: 'family' },
    { name: 'Patagonia Trekking Expedition', img: 'https://images.unsplash.com/photo-1478827387698-1527781a4887?w=600&q=80', days: 12, countries: 2, rating: 4.9, price: 3850, tag: 'Adventure', includes: ['Flights', 'Guide', 'Camp Gear'], category: 'adventure' },
    { name: 'Amalfi Coast Getaway', img : "images/amalfi", days: 6, countries: 1, rating: 4.7, price: 2200, tag: 'Romantic', includes: ['Hotel', 'Meals', 'Transfers'], category: 'honeymoon' },
    { name: 'Great Barrier Reef Cruise', img: 'https://images.unsplash.com/photo-1548574505-5e239809ee19?w=600&q=80', days: 8, countries: 1, rating: 4.8, price: 2780, tag: 'Cruise', includes: ['Flights', 'Cabin', 'Meals'], category: 'cruise' }
  ];

  const grid = document.getElementById('packageGrid');
  let visibleCount = 6;

  function pkgCard(p, i) {
    return `
    <div class="pkg-card reveal-up" data-category="${p.category}" style="opacity:1;">
      <div class="pkg-media">
        <img src="${p.img}" alt="${p.name}">
        <span class="pkg-badge">${p.tag}</span>
        <button class="pkg-fav" data-index="${i}" aria-label="Save package">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.8"><path d="M12 21s-8-5-8-11a5 5 0 019-3 5 5 0 019 3c0 6-8 11-8 11z"/></svg>
        </button>
        <span class="pkg-rating">★ ${p.rating.toFixed(1)}</span>
      </div>
      <div class="pkg-body">
        <div class="pkg-meta"><span>${p.days} Days</span><span>·</span><span>${p.countries} ${p.countries > 1 ? 'Countries' : 'Country'}</span></div>
        <h3>${p.name}</h3>
        ${p.destId ? `<a class="pkg-dest" href="plan-trip.html?dest=${p.destId}&package=${p.id}" title="Plan a trip to ${p.destName} with this package">📍 ${p.destName} · Plan a trip →</a>` : ''}
        <div class="pkg-includes">${p.includes.map(s => `<span>${s}</span>`).join('')}</div>
        <div class="pkg-footer">
          <div class="pkg-price"><strong>$${p.price.toLocaleString()}</strong><span>per person</span></div>
          <div class="pkg-actions">
            <button class="btn btn-outline btn-sm view-itinerary" data-index="${i}">Itinerary</button>
            <button class="btn btn-primary btn-sm book-package" data-index="${i}">Book</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // /packages.html?dest=Santorini (or a destination id) shows only that destination's packages
  const destParam = (new URLSearchParams(location.search).get('dest') || '').trim().toLowerCase();
  let dbLoaded = false;
  const inDest = (p) => !destParam || !dbLoaded || String(p.destId) === destParam || String(p.destName || '').toLowerCase() === destParam;

  function renderPackages() {
    const list = packages.map((p, i) => [p, i]).filter(([p]) => inDest(p));      // keep the original index for the buttons
    grid.innerHTML = list.slice(0, visibleCount).map(([p, i]) => pkgCard(p, i)).join('');
    attachPackageEvents();
    document.getElementById('loadMoreBtn').style.display = visibleCount >= list.length ? 'none' : '';

    let banner = document.getElementById('destBanner');
    if (destParam && dbLoaded) {
      if (!banner) { banner = document.createElement('p'); banner.id = 'destBanner'; banner.className = 'dest-banner'; grid.parentNode.insertBefore(banner, grid); }
      const name = list.length ? list[0][0].destName : decodeURIComponent(destParam);
      banner.innerHTML = list.length
        ? `Showing packages for <strong>${name}</strong> &middot; <a href="packages.html">Show all packages</a>`
        : `No packages for <strong>${name}</strong> yet &middot; <a href="plan-trip.html?dest=${encodeURIComponent(destParam)}">Plan a custom trip</a> or <a href="packages.html">see all packages</a>`;
    }
  }

  function attachPackageEvents() {
    document.querySelectorAll('.pkg-fav').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
    document.querySelectorAll('.book-package').forEach(btn => {
      btn.addEventListener('click', () => openBookingModal(packages[btn.dataset.index].name));
    });
    document.querySelectorAll('.view-itinerary').forEach(btn => {
      btn.addEventListener('click', () => openItineraryModal(packages[btn.dataset.index].name));
    });
  }

  renderPackages();

  // ---- Packages database nunchi load avthayi (server ledu ante static data alaage untundi) ----
  fetch('/api/packages').then((r) => (r.ok ? r.json() : [])).then((rows) => {
    if (!rows.length) return;
    const old = new Map(packages.map((x) => [x.name, x]));
    const mapped = rows.map((r) => {
      const o = old.get(r.name) || {};
      return { id: r.package_id, destId: r.dest_id, destName: r.destination_name, name: r.name, img: r.img_url || o.img, days: r.days, countries: r.countries, rating: Number(r.rating),
               price: Number(r.price), tag: r.tag || o.tag || '', includes: (r.includes && r.includes.length ? r.includes : o.includes) || [],
               category: r.category || o.category };
    });
    packages.splice(0, packages.length, ...mapped);
    dbLoaded = true;
    renderPackages();
  }).catch(() => {});

  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    visibleCount += 3;
    renderPackages();
  });

  /* ---------- SEARCH / FILTER ---------- */
  document.getElementById('searchPanel').addEventListener('submit', e => {
    e.preventDefault();
    document.getElementById('featured').scrollIntoView({ behavior: 'smooth' });
    // simple visual pulse to indicate filtering happened
    grid.style.transition = 'opacity .3s ease';
    grid.style.opacity = '0.3';
    setTimeout(() => grid.style.opacity = '1', 350);
  });

  document.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      visibleCount = packages.length;
      grid.innerHTML = packages.filter(p => p.category === filter || true).slice(0, 9).map(pkgCard).join('');
      attachPackageEvents();
      document.getElementById('featured').scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* =========================================================
     BOOKING & ITINERARY MODALS
     ========================================================= */
  const modalOverlay = document.getElementById('modalOverlay');
  const bookingModal = document.getElementById('bookingModal');
  const itineraryModal = document.getElementById('itineraryModal');

  function openBookingModal(name) {
    document.getElementById('modalTitle').textContent = name;
    // api.js listens to this and loads the departures / seats for the chosen package
    document.dispatchEvent(new CustomEvent('booking:open', { detail: { packageName: name } }));
    modalOverlay.classList.add('active');
    bookingModal.classList.add('active');
    itineraryModal.classList.remove('active');
  }

  function openItineraryModal(name) {
    document.getElementById('itineraryModalTitle').textContent = name;
    const days = ['Arrival & Welcome', 'Guided Sightseeing', 'Free Exploration Day', 'Signature Excursion', 'Culture & Cuisine', 'Leisure & Relaxation', 'Departure'];
    document.getElementById('itineraryModalList').innerHTML = days.map((d, i) =>
      `<div><strong>Day ${i + 1}:</strong> ${d}</div>`).join('');
    modalOverlay.classList.add('active');
    itineraryModal.classList.add('active');
    bookingModal.classList.remove('active');
  }

  function closeModals() {
    modalOverlay.classList.remove('active');
    bookingModal.classList.remove('active');
    itineraryModal.classList.remove('active');
  }

  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModals(); });
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeModals));

  // the modal now stays open until api.js confirms the booking (so errors like "Sold out" stay visible)
  document.getElementById('bookingForm').addEventListener('submit', e => {
    e.preventDefault();
  });

  /* =========================================================
     CUSTOM TRIP BUILDER — LIVE PRICE ESTIMATION
     ========================================================= */
  const bDays = document.getElementById('bDays');
  const bDaysVal = document.getElementById('bDaysVal');
  const builderPrice = document.getElementById('builderPrice');
  const builderProgress = document.getElementById('builderProgress');

  function calcBuilderPrice() {
    const base = parseFloat(document.getElementById('bDestination').value);
    const days = parseInt(bDays.value, 10);
    const style = parseFloat(document.getElementById('bStyle').value);
    const stay = parseFloat(document.getElementById('bStay').value) * days;
    const transport = parseFloat(document.getElementById('bTransport').value);
    const meals = parseFloat(document.getElementById('bMeals').value) * days;
    const guide = parseFloat(document.getElementById('bGuide').value) * days;
    let activities = 0;
    document.querySelectorAll('.chip-toggle input:checked').forEach(cb => activities += parseFloat(cb.value));

    const total = (base + stay + transport + meals + guide + activities) * style;
    builderPrice.textContent = '$' + Math.round(total).toLocaleString();

    // progress bar reflects how many fields have been "touched" toward a complete plan (visual only)
    const filledPct = Math.min(100, 30 + (days / 21) * 30 + (activities > 0 ? 20 : 0) + (guide > 0 ? 20 : 0));
    builderProgress.style.width = filledPct + '%';
  }

  bDays.addEventListener('input', () => { bDaysVal.textContent = bDays.value; calcBuilderPrice(); });
  document.querySelectorAll('#builder select').forEach(sel => sel.addEventListener('change', calcBuilderPrice));
  document.querySelectorAll('.chip-toggle input').forEach(cb => cb.addEventListener('change', calcBuilderPrice));
  calcBuilderPrice();

  document.getElementById('builderCta').addEventListener('click', e => {
    e.preventDefault();
    openBookingModal('Your Custom Package');
  });

  /* =========================================================
     WORLD MAP INTERACTIONS
     ========================================================= */
  const mapInfoName = document.getElementById('mapInfoName');
  const mapInfoText = document.getElementById('mapInfoText');
  const mapPlane = document.getElementById('mapPlane');

  document.querySelectorAll('.pin').forEach(pin => {
    pin.addEventListener('mouseenter', () => {
      mapInfoName.textContent = pin.dataset.name;
      mapInfoText.textContent = pin.dataset.info;
      const transform = pin.getAttribute('transform');
      const coords = transform.match(/[-\d.]+/g);
      if (window.gsap && coords) {
        gsap.to(mapPlane, { attr: { transform: `translate(${coords[0]},${coords[1]})` }, duration: 0.7, ease: 'power2.inOut' });
      }
    });
    pin.addEventListener('click', () => {
      document.getElementById('featured').scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* =========================================================
     EXCLUSIVE OFFERS — COUNTDOWN TIMER
     ========================================================= */
  const countdownEl = document.querySelector('.countdown');
  if (countdownEl) {
    let remaining = parseInt(countdownEl.dataset.hours, 10) * 3600;
    const hEl = countdownEl.querySelector('[data-unit="h"]');
    const mEl = countdownEl.querySelector('[data-unit="m"]');
    const sEl = countdownEl.querySelector('[data-unit="s"]');

    function tick() {
      if (remaining <= 0) return;
      remaining--;
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      hEl.textContent = String(h).padStart(2, '0');
      mEl.textContent = String(m).padStart(2, '0');
      sEl.textContent = String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  /* =========================================================
     GALLERY LIGHTBOX
     ========================================================= */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');

  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      lightboxImg.src = item.querySelector('img').src;
      lightboxCaption.textContent = item.dataset.caption;
      lightbox.classList.add('active');
    });
  });
  document.getElementById('lightboxClose').addEventListener('click', () => lightbox.classList.remove('active'));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('active'); });

  /* =========================================================
     FAQ ACCORDION
     ========================================================= */
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* =========================================================
     NEWSLETTER VALIDATION
     ========================================================= */
  document.getElementById('newsletterForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('newsletterEmail').value;
    const msg = document.getElementById('newsletterMsg');
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (valid) {
      msg.textContent = '✓ You\'re subscribed — welcome aboard!';
      msg.style.color = '#16A34A';
      document.getElementById('newsletterEmail').value = '';
    } else {
      msg.textContent = 'Please enter a valid email address.';
      msg.style.color = '#DC2626';
    }
  });

});
