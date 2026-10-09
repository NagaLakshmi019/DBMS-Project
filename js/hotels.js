/* ============================================================
   TRIPNEST — HOTELS PAGE
   Section 01: Hero + Search — motion layer
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  const NAV_OFFSET = 84; // fixed navbar height

  function smoothScrollTo(selector) {
    const target = document.querySelector(selector);
    if (!target) return;
    gsap.to(window, {
      duration: 1.15,
      scrollTo: { y: target, offsetY: NAV_OFFSET },
      ease: "power3.inOut",
    });
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  /* ---------------------------------------------------------
     0. SMOOTH SCROLL NAVIGATION — hero CTAs + future nav links
     --------------------------------------------------------- */
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      smoothScrollTo(el.getAttribute("data-scroll-to"));
    });
  });

  /* ---------------------------------------------------------
     1. HERO ENTRANCE SEQUENCE
     --------------------------------------------------------- */
  if (!prefersReducedMotion) {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.from(".navbar", { y: -40, opacity: 0, duration: 0.6 })
      .from(".eyebrow", { y: 24, opacity: 0, duration: 0.6 }, 0.15)
      .from(".hero__title", { y: 34, opacity: 0, duration: 0.75 }, 0.28)
      .from(".hero__subtext", { y: 24, opacity: 0, duration: 0.6 }, 0.45)
      .from(".hero__actions .btn", { y: 20, opacity: 0, duration: 0.55, stagger: 0.1 }, 0.55)
      .from(".hero__stats", { y: 16, opacity: 0, duration: 0.5 }, 0.7)
      .from(".floater", { scale: 0.6, opacity: 0, duration: 0.7, stagger: 0.08, ease: "back.out(1.6)" }, 0.4)
      .from(".search-card", { y: 46, opacity: 0, duration: 0.7, ease: "power3.out" }, 0.75);
  } else {
    gsap.set(
      [".navbar", ".eyebrow", ".hero__title", ".hero__subtext", ".hero__actions .btn", ".hero__stats", ".floater", ".search-card"],
      { opacity: 1, y: 0, scale: 1 }
    );
  }

  /* ---------------------------------------------------------
     2. FLOATING ICON IDLE DRIFT
     --------------------------------------------------------- */
  if (!prefersReducedMotion) {
    document.querySelectorAll(".floater").forEach((el, i) => {
      gsap.to(el, {
        y: "+=16",
        x: i % 2 === 0 ? "+=10" : "-=10",
        rotation: i % 2 === 0 ? 4 : -4,
        duration: 3.4 + i * 0.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    });
  }

  /* ---------------------------------------------------------
     3. MOUSE PARALLAX (hero scene + floaters, layered depth)
     --------------------------------------------------------- */
  const hero = document.getElementById("hero");
  if (hero && !prefersReducedMotion && window.matchMedia("(pointer:fine)").matches) {
    const scene = hero.querySelector(".hero__scene");
    const floaterEls = hero.querySelectorAll(".floater");

    hero.addEventListener("mousemove", (e) => {
      const { innerWidth, innerHeight } = window;
      const relX = (e.clientX / innerWidth - 0.5) * 2; // -1 -> 1
      const relY = (e.clientY / innerHeight - 0.5) * 2;

      gsap.to(scene, {
        x: relX * 14,
        y: relY * 10,
        duration: 1.1,
        ease: "power2.out",
      });

      floaterEls.forEach((el) => {
        const speed = parseFloat(el.dataset.speed) || 1;
        gsap.to(el, {
          x: relX * 18 * speed,
          y: relY * 14 * speed,
          duration: 1.2,
          ease: "power2.out",
          overwrite: "auto",
        });
      });
    });

    hero.addEventListener("mouseleave", () => {
      gsap.to(scene, { x: 0, y: 0, duration: 0.8, ease: "power2.out" });
      floaterEls.forEach((el) => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "power2.out", overwrite: "auto" }));
    });
  }

  /* ---------------------------------------------------------
     4. MAGNETIC BUTTONS
     --------------------------------------------------------- */
  if (!prefersReducedMotion && window.matchMedia("(pointer:fine)").matches) {
    document.querySelectorAll("[data-magnetic]").forEach((btn) => {
      const strength = 0.35;

      btn.addEventListener("mousemove", (e) => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        gsap.to(btn, {
          x: relX * strength,
          y: relY * strength,
          duration: 0.4,
          ease: "power2.out",
        });
      });

      btn.addEventListener("mouseleave", () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      });
    });
  }

  /* ---------------------------------------------------------
     5. RIPPLE EFFECT ON BUTTON CLICK
     --------------------------------------------------------- */
  document.querySelectorAll(".btn, .btn-search").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height);

      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

      btn.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    });
  });

  /* ---------------------------------------------------------
     6. SEARCH FORM — placeholder submit handling
     --------------------------------------------------------- */
  const searchForm = document.getElementById("searchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();

      gsap.fromTo(
        "#searchBtn",
        { scale: 1 },
        { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" }
      );

      const destination = document.getElementById("destination").value.trim();
      const guests = document.getElementById("guests").value;

      // Section 3 (Featured Hotels) will read these same field values to
      // filter its hotel-card grid live and highlight matches. For now,
      // with no hotel data mounted yet, we scroll to the target section
      // and surface what was searched so the interaction still feels real.
      smoothScrollTo("#featured-hotels");
      showToast(
        destination
          ? `Showing hotels in "${destination}" for ${guests}`
          : `Showing all hotels for ${guests}`
      );
    });
  }
});

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

  