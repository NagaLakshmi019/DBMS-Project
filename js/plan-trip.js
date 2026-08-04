/* =========================================================
   TRIPNEST — PLAN TRIP PAGE LOGIC
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  const STEP_KEYS = ['destination', 'hotel', 'package', 'budget', 'dates', 'review'];
  const TOTAL_STEPS = STEP_KEYS.length;

  const state = {
    currentStep: 0,
    destination: null,
    destinationPrice: null,
    hotel: null,
    hotelPrice: null,
    package: null,
    budget: 2500,
    startDate: null,
    endDate: null,
    travelers: '2 travelers',
    completedSteps: new Set(),
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------------------------------------------------------
     NAV TOGGLE (mobile)
     --------------------------------------------------------- */
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');
  if (navToggle) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('is-open'));
  }

  /* ---------------------------------------------------------
     MAGNETIC BUTTONS + RIPPLE
     --------------------------------------------------------- */
  $$('.btn-magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(btn, { x: x * 0.25, y: y * 0.35, duration: 0.4, ease: 'power2.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    });
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--rx', `${e.clientX - r.left}px`);
    btn.style.setProperty('--ry', `${e.clientY - r.top}px`);
    btn.classList.remove('is-rippling');
    void btn.offsetWidth;
    btn.classList.add('is-rippling');
  });

  /* ---------------------------------------------------------
     OPTION CARD TILT + SELECTION
     --------------------------------------------------------- */
  $$('.pt-option-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, { rotateX: py * -6, rotateY: px * 6, duration: 0.3, ease: 'power2.out', transformPerspective: 600 });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'power2.out' });
    });
    card.addEventListener('click', () => {
      const group = card.closest('.pt-option-grid');
      $$('.pt-option-card', group).forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const groupName = group.dataset.group;
      const value = card.dataset.value;
      const price = card.dataset.price;

      if (groupName === 'destination') { state.destination = value; state.destinationPrice = price; }
      if (groupName === 'hotel') { state.hotel = value; state.hotelPrice = price; }
      if (groupName === 'package') { state.package = value; }

      gsap.fromTo(card, { scale: 0.97 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
      updateSummary();
    });
  });

  /* ---------------------------------------------------------
     BUDGET SLIDER
     --------------------------------------------------------- */
  const budgetSlider = $('#budgetSlider');
  const budgetValueEl = $('#budgetValue');
  const tiers = $$('.pt-tier');

  function tierFor(v) {
    if (v < 2200) return 'Comfort';
    if (v < 5000) return 'Premium';
    return 'Luxury';
  }

  if (budgetSlider) {
    budgetSlider.addEventListener('input', () => {
      const v = Number(budgetSlider.value);
      state.budget = v;
      const counter = { val: Number(budgetValueEl.textContent) || 0 };
      gsap.to(counter, {
        val: v, duration: 0.3, ease: 'power1.out',
        onUpdate: () => { budgetValueEl.textContent = Math.round(counter.val).toLocaleString(); },
      });
      const active = tierFor(v);
      tiers.forEach((t) => t.classList.toggle('is-active', t.dataset.tier === active));
      updateSummary();
    });
  }

  tiers.forEach((tier) => {
    tier.addEventListener('click', () => {
      const map = { Comfort: 1600, Premium: 2500, Luxury: 6000 };
      const v = map[tier.dataset.tier];
      budgetSlider.value = v;
      budgetSlider.dispatchEvent(new Event('input'));
    });
  });

  /* ---------------------------------------------------------
     DATES & TRAVELERS
     --------------------------------------------------------- */
  const startDateEl = $('#startDate');
  const endDateEl = $('#endDate');
  const travelersEl = $('#travelers');
  const mealPrefEl = $('#mealPref');

  function fmtDate(d) {
    if (!d) return null;
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return null;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function syncDatesState() {
    state.startDate = startDateEl.value || null;
    state.endDate = endDateEl.value || null;
    state.travelers = travelersEl.value;
    updateSummary();
  }

  [startDateEl, endDateEl, travelersEl, mealPrefEl].forEach((el) => {
    if (el) el.addEventListener('change', syncDatesState);
  });

  /* ---------------------------------------------------------
     STEP NAVIGATION
     --------------------------------------------------------- */
  const panels = $$('.pt-step-panel');
  const sidebarSteps = $$('.pt-step');
  const stepsFill = $('#stepsFill');
  const sidebarPct = $('#sidebarPct');
  const mobileFill = $('#mobileFill');
  const mobilePctLabel = $('#mobilePctLabel');
  const mobileStepLabel = $('#mobileStepLabel');

  function goToStep(index, markPreviousComplete = true) {
    if (markPreviousComplete && index > state.currentStep) {
      state.completedSteps.add(state.currentStep);
    }
    state.currentStep = index;

    panels.forEach((p, i) => {
      if (i === index) {
        p.hidden = false;
        gsap.fromTo(p, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out' });
      } else {
        p.hidden = true;
      }
    });

    renderSidebar();
    if (index === TOTAL_STEPS - 1) renderReview();
    window.scrollTo({ top: $('.pt-panel').getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
  }

  $$('[data-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.currentStep < TOTAL_STEPS - 1) goToStep(state.currentStep + 1);
    });
  });
  $$('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.currentStep > 0) goToStep(state.currentStep - 1, false);
    });
  });

  sidebarSteps.forEach((step) => {
    step.addEventListener('click', () => {
      const idx = Number(step.dataset.step);
      if (idx <= state.currentStep || state.completedSteps.has(idx - 1)) goToStep(idx, false);
    });
  });

  function renderSidebar() {
    const doneCount = state.completedSteps.size + (state.currentStep === TOTAL_STEPS - 1 && allRequiredFilled() ? 1 : 0);
    const pct = Math.round((state.completedSteps.size / TOTAL_STEPS) * 100);

    sidebarSteps.forEach((step, i) => {
      step.classList.toggle('is-active', i === state.currentStep);
      const done = state.completedSteps.has(i);
      step.classList.toggle('is-done', done);
      const dot = $('.pt-step__dot', step);
      dot.innerHTML = done
        ? '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : String(i + 1);
    });

    const fillPct = (state.completedSteps.size / (TOTAL_STEPS - 1)) * 100;
    gsap.to(stepsFill, { height: `${Math.min(fillPct, 100)}%`, duration: 0.7, ease: 'power2.out' });
    sidebarPct.textContent = `${pct}%`;

    // mobile
    gsap.to(mobileFill, { width: `${pct}%`, duration: 0.7, ease: 'power2.out' });
    mobilePctLabel.textContent = `${pct}%`;
    mobileStepLabel.textContent = STEP_KEYS[state.currentStep][0].toUpperCase() + STEP_KEYS[state.currentStep].slice(1);

    updateRing(pct);
  }

  function allRequiredFilled() {
    return state.destination && state.hotel && state.package && state.startDate && state.endDate;
  }

  /* ---------------------------------------------------------
     PROGRESS RING (Floating Summary)
     --------------------------------------------------------- */
  const ringFill = $('#ringFill');
  const ringPct = $('#ringPct');
  const RING_CIRC = 2 * Math.PI * 24;

  function updateRing(pct) {
    const offset = RING_CIRC - (pct / 100) * RING_CIRC;
    gsap.to(ringFill, { strokeDashoffset: offset, duration: 0.8, ease: 'power2.out' });
    const counter = { val: Number(ringPct.textContent) || 0 };
    gsap.to(counter, {
      val: pct, duration: 0.8, ease: 'power2.out',
      onUpdate: () => { ringPct.textContent = `${Math.round(counter.val)}%`; },
    });
  }

  /* ---------------------------------------------------------
     FLOATING TRIP SUMMARY — live text updates
     --------------------------------------------------------- */
  const summaryCard = $('#tripSummary');

  function setField(field, value, empty = false) {
    const el = $(`.pt-summary__row [data-field="${field}"]`);
    if (!el) return;
    if (el.textContent.trim() === String(value)) return;
    el.classList.toggle('is-empty', empty);
    gsap.fromTo(el, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    el.textContent = value;
    summaryCard.classList.add('is-glowing');
    clearTimeout(summaryCard._glowTimer);
    summaryCard._glowTimer = setTimeout(() => summaryCard.classList.remove('is-glowing'), 700);
  }

  function durationDays() {
    if (!state.startDate || !state.endDate) return null;
    const a = new Date(state.startDate);
    const b = new Date(state.endDate);
    const diff = Math.round((b - a) / 86400000);
    return diff > 0 ? diff : null;
  }

  function updateSummary() {
    setField('destination', state.destination || 'Not selected', !state.destination);
    setField('hotel', state.hotel || 'Not selected', !state.hotel);
    setField('package', state.package || 'Not selected', !state.package);

    const s = fmtDate(state.startDate);
    const e = fmtDate(state.endDate);
    setField('dates', s && e ? `${s} – ${e}` : 'Not set', !(s && e));

    setField('travelers', state.travelers, false);
    setField('budget', `$${state.budget.toLocaleString()}`, false);

    const dur = durationDays();
    setField('duration', dur ? `${dur} days` : 'Not set', !dur);
  }

  /* ---------------------------------------------------------
     REVIEW STEP
     --------------------------------------------------------- */
  const reviewList = $('#reviewList');
  function renderReview() {
    const dur = durationDays();
    const rows = [
      ['📍', 'Destination', state.destination || '—'],
      ['🏨', 'Hotel', state.hotel || '—'],
      ['🎒', 'Package', state.package || '—'],
      ['📅', 'Dates', state.startDate && state.endDate ? `${fmtDate(state.startDate)} – ${fmtDate(state.endDate)}` : '—'],
      ['👥', 'Travelers', state.travelers],
      ['💰', 'Budget', `$${state.budget.toLocaleString()}`],
      ['⏳', 'Duration', dur ? `${dur} days` : '—'],
    ];
    reviewList.innerHTML = rows.map(([icon, k, v]) => `
      <div class="pt-review-row">
        <span class="k"><span>${icon}</span>${k}</span>
        <span class="v">${v}</span>
      </div>
    `).join('');
  }

  /* ---------------------------------------------------------
     MOBILE BOTTOM SHEET TOGGLE
     --------------------------------------------------------- */
  const sheetToggle = $('#sheetToggle');
  if (sheetToggle) {
    sheetToggle.addEventListener('click', () => {
      if (window.innerWidth > 1080) return;
      summaryCard.classList.toggle('is-expanded');
    });
  }

  /* ---------------------------------------------------------
     SCROLLTRIGGER — panel reveal
     --------------------------------------------------------- */
  gsap.utils.toArray('.pt-panel').forEach((panel) => {
    gsap.from(panel, {
      autoAlpha: 0, y: 24, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: panel, start: 'top 88%', once: true },
    });
  });

  /* ---------------------------------------------------------
     COMPLETION CELEBRATION
     --------------------------------------------------------- */
  const finishBtn = $('#finishBtn');
  const celebrationLayer = $('#celebrationLayer');
  const glowWash = $('#glowWash');
  const routePath = $('#routePath');
  const flyPlane = $('#flyPlane');
  const modalBackdrop = $('#modalBackdrop');
  const successModal = $('#successModal');

  function spawnSparkles(count = 14) {
    const frag = document.createDocumentFragment();
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('fill', 'none');
      s.classList.add('pt-sparkle');
      s.style.left = `${45 + Math.random() * 30}%`;
      s.style.top = `${25 + Math.random() * 35}%`;
      s.innerHTML = '<path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" fill="currentColor"/>';
      celebrationLayer.appendChild(s);
      nodes.push(s);
    }
    return nodes;
  }

  function fillModal() {
    const dur = durationDays();
    const map = {
      destination: state.destination || '—',
      hotel: state.hotel || '—',
      package: state.package || '—',
      budget: `$${state.budget.toLocaleString()}`,
      duration: dur ? `${dur} days` : '—',
      travelers: state.travelers,
    };
    Object.entries(map).forEach(([k, v]) => {
      const el = $(`[data-modal="${k}"]`);
      if (el) el.textContent = v;
    });
  }

  function playCelebration() {
    fillModal();
    celebrationLayer.classList.add('is-active');
    const pathLen = routePath.getTotalLength();
    routePath.style.strokeDasharray = pathLen;
    routePath.style.strokeDashoffset = pathLen;

    const p0 = routePath.getPointAtLength(0);
    gsap.set(flyPlane, { x: p0.x - 23, y: p0.y - 23, opacity: 0 });

    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        celebrationLayer.classList.remove('is-active');
        gsap.set(glowWash, { opacity: 0 });
        gsap.set(flyPlane, { opacity: 0 });
        $$('.pt-sparkle', celebrationLayer).forEach((n) => n.remove());
      },
    });

    // 1. ring already animates via updateRing(100) called before this
    // 2. summary expands slightly
    tl.to(summaryCard, { scale: 1.02, duration: 0.35, ease: 'power2.out' }, 0)
      .to(summaryCard, { scale: 1, duration: 0.4, ease: 'power2.inOut' }, 0.4)
      // 3. soft blue glow
      .to(glowWash, { opacity: 1, duration: 0.6 }, 0.1)
      // 4. airplane flies across leaving dotted route
      .to(flyPlane, { opacity: 1, duration: 0.2 }, 0.3)
      .to(routePath, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, 0.35)
      .to({ t: 0 }, {
        t: 1, duration: 1.6, ease: 'power1.inOut',
        onUpdate: function () {
          const len = pathLen * this.targets()[0].t;
          const pt = routePath.getPointAtLength(len);
          const ahead = routePath.getPointAtLength(Math.min(len + 2, pathLen));
          const angle = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * (180 / Math.PI);
          gsap.set(flyPlane, { x: pt.x - 23, y: pt.y - 23, rotate: angle });
        },
      }, 0.35)
      .to(flyPlane, { opacity: 0, duration: 0.3 }, 1.9)
      // 5. sparkles fade in
      .add(() => {
        const sparkles = spawnSparkles(14);
        gsap.fromTo(sparkles, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.03, ease: 'back.out(2)' });
        gsap.to(sparkles, { opacity: 0, duration: 0.6, delay: 0.8, stagger: 0.02 });
      }, 1.5)
      .to(glowWash, { opacity: 0, duration: 0.6 }, 2.4)
      // 6. success modal
      .add(() => {
        modalBackdrop.classList.add('is-open');
        gsap.to(modalBackdrop, { opacity: 1, duration: 0.4 });
        gsap.to(successModal, { scale: 1, y: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.6)' });
      }, 2.2);
  }

  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      state.completedSteps.add(TOTAL_STEPS - 1);
      renderSidebar();
      updateRing(100);
      playCelebration();
    });
  }

  function closeModal() {
    gsap.to(successModal, { scale: 0.9, y: 24, opacity: 0, duration: 0.35, ease: 'power2.in' });
    gsap.to(modalBackdrop, {
      opacity: 0, duration: 0.35, onComplete: () => modalBackdrop.classList.remove('is-open'),
    });
  }

  $('#modalClose').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

  $('#restartBtn').addEventListener('click', () => {
    closeModal();
    setTimeout(() => window.location.reload(), 400);
  });

  $('#downloadBtn').addEventListener('click', () => {
    const dur = durationDays();
    const lines = [
      'TRIPNEST ITINERARY', '',
      `Destination: ${state.destination || '—'}`,
      `Hotel: ${state.hotel || '—'}`,
      `Package: ${state.package || '—'}`,
      `Dates: ${state.startDate && state.endDate ? `${fmtDate(state.startDate)} – ${fmtDate(state.endDate)}` : '—'}`,
      `Duration: ${dur ? `${dur} days` : '—'}`,
      `Travelers: ${state.travelers}`,
      `Budget: $${state.budget.toLocaleString()}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tripnest-itinerary.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#saveTripBtn').addEventListener('click', () => {
    gsap.fromTo('#saveTripBtn', { scale: 0.96 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
  });

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */
  renderSidebar();
  updateSummary();
})();


 /*---------- CUSTOM CURSOR ---------- */
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



