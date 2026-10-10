/* ============================================================
   TRIPNEST — HOTEL DETAILS PAGE
   Fully data-driven render layer + interactions:
   gallery/lightbox, 360 tour, video tour, rooms, reviews,
   FAQ accordion, booking sidebar, wishlist/compare/share,
   custom cursor, magnetic buttons, ripple, toast.
   ============================================================ */

window.hotelsReady.then(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const hotelId = Number(params.get("id")) || 1;
  const hotel = HOTELS[hotelId] || HOTELS[1];

  // "Plan a trip with this hotel": opens the planner with this hotel's destination and the hotel preselected
  fetch(`/api/hotels/${hotelId}`).then((r) => (r.ok ? r.json() : null)).then((h) => {
    const link = document.getElementById("planTripLink");
    if (!h || !link) return;
    link.href = `plan-trip.html?dest=${h.dest_id}&hotel=${h.hotel_id}`;
    link.style.display = "block";
  }).catch(() => {});

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     PLACEHOLDER-SAFE IMAGE FALLBACK
     If a hotlinked photo ever fails (network hiccup, dead
     link), swap it for a themed gradient tile instead of a
     broken-image icon — never a dead end for the user.
     --------------------------------------------------------- */
  function fallbackSrc(label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2f5fdb"/><stop offset="100%" stop-color="#2fd6c8"/>
      </linearGradient></defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <text x="50%" y="50%" font-family="sans-serif" font-size="28" fill="#ffffff" fill-opacity="0.85" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`;
    return "data:image/svg+xml;base64," + btoa(svg);
  }
  function safeImg(img, label) {
    img.addEventListener("error", function onErr() {
      img.removeEventListener("error", onErr);
      img.src = fallbackSrc(label || hotel.name);
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

  function starString(rating) {
    const full = Math.round(rating);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  /* ===========================================================
     RENDER: HEADER / QUICK INFO
     =========================================================== */
  function renderHeader() {
    document.title = `${hotel.name} — TripNest`;
    document.getElementById("bcHotelName").textContent = hotel.name;

    const badgeWrap = document.getElementById("hdBadges");
    badgeWrap.innerHTML = hotel.badges.map((b) => `<span class="hd-badge">${b}</span>`).join("");

    document.getElementById("hdName").textContent = hotel.name;
    document.querySelector("#hdLocation span").textContent = hotel.location;

    document.getElementById("hdScore").textContent = hotel.rating.toFixed(1);
    document.getElementById("hdStars").textContent = starString(hotel.rating);
    document.getElementById("hdReviewCount").textContent = `${hotel.reviewsCount} reviews`;

    document.getElementById("hdPriceFrom").textContent = `$${hotel.priceFrom}`;
    document.getElementById("hdSidebarPrice").textContent = `$${hotel.priceFrom}`;

    document.getElementById("hdDescription").textContent = hotel.description;
  }

  /* ===========================================================
     RENDER: HERO GALLERY + THUMBS
     =========================================================== */
  let currentHeroIndex = 0;

  function renderGallery() {
    const heroImg = document.getElementById("hdHeroImg");
    heroImg.alt = `${hotel.name} — photo 1`;
    heroImg.src = hotel.images[0];
    safeImg(heroImg, hotel.name);

    const strip = document.getElementById("hdThumbStrip");
    strip.innerHTML = "";
    hotel.images.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = `${hotel.name} thumbnail ${i + 1}`;
      if (i === 0) img.classList.add("is-active");
      safeImg(img, hotel.name);
      img.addEventListener("click", () => setHero(i));
      strip.appendChild(img);
    });

    document.getElementById("hdHeroImgBtn").addEventListener("click", () => openLightbox(currentHeroIndex));
  }

  function setHero(i) {
    currentHeroIndex = i;
    const heroImg = document.getElementById("hdHeroImg");
    heroImg.src = hotel.images[i];
    heroImg.alt = `${hotel.name} — photo ${i + 1}`;
    document.querySelectorAll("#hdThumbStrip img").forEach((el, idx) => el.classList.toggle("is-active", idx === i));
  }

  /* ===========================================================
     GALLERY TABS (Photos / 360 / Video)
     =========================================================== */
  function initGalleryTabs() {
    const tabs = document.querySelectorAll(".hd-gtab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        const view = tab.dataset.view;
        document.querySelectorAll(".hd-view").forEach((v) => v.classList.remove("is-active"));
        document.querySelector(`[data-view-panel="${view}"]`).classList.add("is-active");

        if (view === "video") {
          const video = document.getElementById("hdVideo");
          if (!video.src) {
            video.src = hotel.videoUrl;
            video.poster = hotel.videoPoster;
          }
        }
      });
    });
  }

  /* ===========================================================
     360 TOUR VIEWER (drag-to-pan panorama, auto-rotate, hotspots)
     =========================================================== */
  const HOTSPOT_LABELS = ["Lobby & Reception", "Pool Deck", "Sunset Lounge"];

  function buildHotspots(container, seed) {
    container.innerHTML = "";
    const positions = [
      { left: "18%", top: "58%" },
      { left: "48%", top: "40%" },
      { left: "76%", top: "62%" }
    ];
    positions.forEach((pos, i) => {
      const dot = document.createElement("div");
      dot.className = "tour360-hotspot";
      dot.style.left = pos.left;
      dot.style.top = pos.top;
      dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <span class="tour360-hotspot__tip">${HOTSPOT_LABELS[i % HOTSPOT_LABELS.length]}</span>`;
      dot.addEventListener("click", () => showToast(`📍 ${HOTSPOT_LABELS[i % HOTSPOT_LABELS.length]}`));
      container.appendChild(dot);
    });
  }

  function initTour360(trackEl, containerEl, hotspotsEl) {
    trackEl.style.backgroundImage = `url(${hotel.panorama})`;
    trackEl.style.backgroundRepeat = "repeat-x";
    trackEl.style.backgroundSize = "auto 100%";
    buildHotspots(hotspotsEl, hotel.id);

    let posX = 0;
    let dragging = false;
    let startClientX = 0;
    let startPos = 0;
    let autoRotate = false;
    let rafId = null;

    function applyPos() {
      trackEl.style.backgroundPosition = `${posX}px 0`;
    }

    function autoTick() {
      if (!autoRotate) return;
      posX -= 0.4;
      applyPos();
      rafId = requestAnimationFrame(autoTick);
    }

    containerEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      autoRotate = false;
      containerEl.setPointerCapture(e.pointerId);
      startClientX = e.clientX;
      startPos = posX;
    });
    containerEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      posX = startPos + (e.clientX - startClientX);
      applyPos();
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
      containerEl.addEventListener(evt, () => { dragging = false; })
    );

    return {
      toggleAuto(force) {
        autoRotate = typeof force === "boolean" ? force : !autoRotate;
        if (autoRotate && !prefersReducedMotion) {
          cancelAnimationFrame(rafId);
          autoTick();
        }
        return autoRotate;
      }
    };
  }

  let tour360Handle = null;
  let tour360FullHandle = null;

  function initTour360Section() {
    tour360Handle = initTour360(
      document.getElementById("tour360Track"),
      document.getElementById("tour360"),
      document.getElementById("tour360Hotspots")
    );

    document.getElementById("tour360AutoBtn").addEventListener("click", (e) => {
      const on = tour360Handle.toggleAuto();
      e.currentTarget.setAttribute("aria-pressed", String(on));
      showToast(on ? "Auto-rotate on" : "Auto-rotate off");
    });

    document.getElementById("tour360FullBtn").addEventListener("click", () => {
      const overlay = document.getElementById("tour360Overlay");
      overlay.classList.add("is-open");
      if (!tour360FullHandle) {
        tour360FullHandle = initTour360(
          document.getElementById("tour360FullTrack"),
          document.getElementById("tour360Full"),
          document.getElementById("tour360FullHotspots")
        );
      }
    });

    document.getElementById("tour360OverlayClose").addEventListener("click", closeTour360Overlay);
    document.getElementById("tour360Overlay").addEventListener("click", (e) => {
      if (e.target.id === "tour360Overlay") closeTour360Overlay();
    });
  }

  function closeTour360Overlay() {
    document.getElementById("tour360Overlay").classList.remove("is-open");
  }

  /* ===========================================================
     VIDEO TOUR
     =========================================================== */
  function initVideoTour() {
    const video = document.getElementById("hdVideo");
    const playBtn = document.getElementById("hdVideoPlayBtn");
    playBtn.addEventListener("click", () => {
      if (!video.src) { video.src = hotel.videoUrl; video.poster = hotel.videoPoster; }
      video.play();
      playBtn.classList.add("is-hidden");
    });
    video.addEventListener("click", () => {
      if (!video.paused) { video.pause(); playBtn.classList.remove("is-hidden"); }
    });
    video.addEventListener("ended", () => playBtn.classList.remove("is-hidden"));
  }

  /* ===========================================================
     FULLSCREEN LIGHTBOX GALLERY
     =========================================================== */
  let lightboxIndex = 0;

  function openLightbox(index) {
    lightboxIndex = index || 0;
    const lb = document.getElementById("lightbox");
    renderLightboxThumbs();
    updateLightbox();
    lb.classList.add("is-open");
  }
  function closeLightbox() {
    document.getElementById("lightbox").classList.remove("is-open");
  }
  function updateLightbox() {
    const img = document.getElementById("lightboxImg");
    img.src = hotel.images[lightboxIndex];
    img.alt = `${hotel.name} — photo ${lightboxIndex + 1}`;
    document.getElementById("lightboxCounter").textContent = `${lightboxIndex + 1} / ${hotel.images.length}`;
    document.querySelectorAll(".lightbox__thumbs img").forEach((el, i) => el.classList.toggle("is-active", i === lightboxIndex));
  }
  function renderLightboxThumbs() {
    const wrap = document.getElementById("lightboxThumbs");
    wrap.innerHTML = "";
    hotel.images.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = `Thumbnail ${i + 1}`;
      img.addEventListener("click", () => { lightboxIndex = i; updateLightbox(); });
      wrap.appendChild(img);
    });
  }
  function initLightbox() {
    document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
    document.getElementById("lightboxPrev").addEventListener("click", () => {
      lightboxIndex = (lightboxIndex - 1 + hotel.images.length) % hotel.images.length;
      updateLightbox();
    });
    document.getElementById("lightboxNext").addEventListener("click", () => {
      lightboxIndex = (lightboxIndex + 1) % hotel.images.length;
      updateLightbox();
    });
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (!document.getElementById("lightbox").classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") document.getElementById("lightboxPrev").click();
      if (e.key === "ArrowRight") document.getElementById("lightboxNext").click();
    });
  }

  /* ===========================================================
     AMENITIES
     =========================================================== */
  function renderAmenities() {
    const wrap = document.getElementById("hdAmenities");
    wrap.innerHTML = hotel.amenities.map((a) => `
      <div class="hd-amenity">${AMENITY_ICONS[a.icon] || ""}<span>${a.label}</span></div>
    `).join("");
  }

  /* ===========================================================
     ROOMS
     =========================================================== */
  let selectedRoomIndex = 0;

  function renderRooms() {
    const wrap = document.getElementById("hdRooms");
    wrap.innerHTML = hotel.rooms.map((room, i) => `
      <div class="hd-room" data-room-index="${i}">
        <div class="hd-room__gallery" data-gallery="${i}">
          ${room.images.map((src, gi) => `<img src="${src}" alt="${room.name} photo ${gi + 1}" class="${gi === 0 ? "is-active" : ""}" data-g-idx="${gi}" />`).join("")}
          <div class="hd-room__gallery-dots">${room.images.map((_, gi) => `<span class="${gi === 0 ? "is-active" : ""}"></span>`).join("")}</div>
        </div>
        <div class="hd-room__info">
          <div class="hd-room__name">${room.name}</div>
          <div class="hd-room__meta">
            <span>${room.size}</span><span>•</span><span>${room.capacity}</span><span>•</span><span>${room.bed}</span>
          </div>
          <div class="hd-room__amenities">${room.amenities.map((a) => `<span>${a}</span>`).join("")}</div>
          <div class="hd-room__cancel ${room.cancellation.startsWith("Non-refundable") ? "is-strict" : ""}">${room.cancellation}</div>
        </div>
        <div class="hd-room__buy">
          <div class="hd-room__price">$${room.price}<small>/ night</small></div>
          <button type="button" class="hd-room__select" data-select-room="${i}">${i === selectedRoomIndex ? "Selected" : "Select Room"}</button>
        </div>
      </div>
    `).join("");

    hotel.rooms.forEach((_, i) => {
      wrap.querySelectorAll(`.hd-room__gallery[data-gallery="${i}"] img`).forEach((img) => safeImg(img, hotel.name));
    });

    wrap.querySelectorAll(".hd-room__select").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedRoomIndex = Number(btn.dataset.selectRoom);
        document.getElementById("bkRoom").selectedIndex = selectedRoomIndex;
        renderRooms();
        updateBreakdown();
        showToast(`${hotel.rooms[selectedRoomIndex].name} selected`);
      });
    });

    // mini gallery autoplay
    if (!prefersReducedMotion) {
      hotel.rooms.forEach((room, i) => {
        if (room.images.length < 2) return;
        let gi = 0;
        setInterval(() => {
          gi = (gi + 1) % room.images.length;
          const gallery = wrap.querySelector(`.hd-room__gallery[data-gallery="${i}"]`);
          if (!gallery) return;
          gallery.querySelectorAll("img").forEach((img, idx) => img.classList.toggle("is-active", idx === gi));
          gallery.querySelectorAll(".hd-room__gallery-dots span").forEach((dot, idx) => dot.classList.toggle("is-active", idx === gi));
        }, 3600 + i * 400);
      });
    }
  }

  /* ===========================================================
     POLICIES + RULES
     =========================================================== */
  function renderPolicies() {
    document.getElementById("hdPolicies").innerHTML = hotel.policies.map((p) => `<li><span>${p.label}</span><b>${p.value}</b></li>`).join("");
    document.getElementById("hdRules").innerHTML = hotel.rules.map((r) => `<li>${r}</li>`).join("");
  }

  /* ===========================================================
     ATTRACTIONS
     =========================================================== */
  function renderAttractions() {
    document.getElementById("hdAttractions").innerHTML = hotel.attractions.map((a) => `
      <div class="hd-attraction">
        <div class="hd-attraction__icon">${AMENITY_ICONS[a.icon] || ""}</div>
        <div><div class="hd-attraction__name">${a.name}</div><div class="hd-attraction__dist">${a.distance} away</div></div>
      </div>
    `).join("");
  }

  /* ===========================================================
     MAP
     =========================================================== */
  function renderMap() {
    document.getElementById("hdMapAddress").textContent = hotel.address;
    document.getElementById("hdMapFrame").src = `https://www.google.com/maps?q=${hotel.coords.lat},${hotel.coords.lng}&z=13&output=embed`;
    document.getElementById("hdDirectionsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${hotel.coords.lat},${hotel.coords.lng}`;
  }

  /* ===========================================================
     REVIEWS
     =========================================================== */
  let reviewFilter = "all";

  function renderReviews() {
    const list = hotel.reviews;
    document.getElementById("hdReviewsBigScore").textContent = hotel.rating.toFixed(1);
    document.getElementById("hdReviewsBigStars").innerHTML = `<span style="color:#f5a623">${starString(hotel.rating)}</span>`;
    document.getElementById("hdReviewsBigCount").textContent = `Based on ${hotel.reviewsCount} reviews`;

    const counts = [0, 0, 0, 0, 0, 0];
    list.forEach((r) => counts[r.rating]++);
    const max = Math.max(...counts, 1);
    document.getElementById("hdReviewsBars").innerHTML = [5, 4, 3, 2, 1].map((star) => `
      <div class="hd-reviews-bar">
        <span>${star}★</span>
        <div class="hd-reviews-bar__track"><div class="hd-reviews-bar__fill" style="width:${(counts[star] / max) * 100}%"></div></div>
        <span>${counts[star]}</span>
      </div>
    `).join("");

    const filters = document.getElementById("hdReviewsFilters");
    filters.innerHTML = ["all", 5, 4, 3, 2, 1].map((f) => `<button type="button" data-filter="${f}" class="${reviewFilter == f ? "is-active" : ""}">${f === "all" ? "All Reviews" : f + " ★"}</button>`).join("");
    filters.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => { reviewFilter = btn.dataset.filter; renderReviewsList(); renderReviews(); });
    });

    renderReviewsList();
  }

  // review name/text are typed by visitors, so they must be escaped before going into innerHTML (stops stored XSS)
  function escHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function renderReviewsList() {
    const list = reviewFilter === "all" ? hotel.reviews : hotel.reviews.filter((r) => String(r.rating) === String(reviewFilter));
    const wrap = document.getElementById("hdReviewsList");
    if (!list.length) {
      wrap.innerHTML = `<p class="hd-desc">No reviews yet at this rating.</p>`;
      return;
    }
    wrap.innerHTML = list.map((r, i) => `
      <div class="hd-review">
        <div class="hd-review__head">
          <div class="hd-review__avatar">${escHtml(String(r.name).charAt(0))}</div>
          <div>
            <div class="hd-review__name">${escHtml(r.name)}</div>
            <div class="hd-review__date">${escHtml(r.date)}</div>
          </div>
          <div class="hd-review__stars">${starString(r.rating)}</div>
        </div>
        <p class="hd-review__text">${escHtml(r.text)}</p>
        <button type="button" class="hd-review__helpful" data-helpful-idx="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h12.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 18 11h-5V5a2 2 0 0 0-4 0v1L7 11"/></svg>
          Helpful (<span>${r.helpful}</span>)
        </button>
      </div>
    `).join("");

    wrap.querySelectorAll("[data-helpful-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("is-active")) return;
        const idx = Number(btn.dataset.helpfulIdx);
        list[idx].helpful++;
        btn.classList.add("is-active");
        btn.querySelector("span").textContent = list[idx].helpful;
      });
    });
  }

  async function loadDbReviews() {
    try {
      const res = await fetch(`/api/hotels/${hotelId}/reviews`);
      if (!res.ok) return;
      const d = await res.json();
      if (!d.reviews.length) return;
      d.reviews.slice().reverse().forEach((r) => hotel.reviews.unshift({
        name: r.full_name, rating: r.rating, date: String(r.created_at).slice(0, 10), text: r.comment || "", helpful: 0
      }));
      hotel.reviewsCount += d.reviews.length;
      document.getElementById("hdReviewCount").textContent = `${hotel.reviewsCount} reviews`;
      renderReviews();
    } catch (e) { /* server ledu ante static reviews chupistundi */ }
  }

  function initWriteReview() {
    const overlay = document.getElementById("reviewModalOverlay");
    let chosenStars = 0;

    document.getElementById("btnWriteReview").addEventListener("click", () => overlay.classList.add("is-open"));
    document.getElementById("reviewModalClose").addEventListener("click", () => overlay.classList.remove("is-open"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("is-open"); });

    const starBtns = document.querySelectorAll("#reviewFormStars button");
    starBtns.forEach((b) => {
      b.addEventListener("click", () => {
        chosenStars = Number(b.dataset.star);
        starBtns.forEach((s) => s.classList.toggle("is-active", Number(s.dataset.star) <= chosenStars));
      });
    });

    document.getElementById("reviewForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = document.getElementById("reviewText").value.trim();
      if (!text) return;
      let u = null; try { u = JSON.parse(localStorage.getItem("tripnest_user")); } catch (err) {}
      if (!u || !u.token) { alert("Please login to post a review."); location.href = "login.html"; return; }
      try {
        const res = await fetch(`/api/hotels/${hotelId}/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-auth-token": u.token },
          body: JSON.stringify({ rating: chosenStars || 5, comment: text })
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not save review"); }
      } catch (err) { alert(err.message); return; }
      const name = u.name;
      hotel.reviews.unshift({
        name, rating: chosenStars || 5, date: "Just now", text, helpful: 0
      });
      hotel.reviewsCount++;
      overlay.classList.remove("is-open");
      document.getElementById("reviewForm").reset();
      chosenStars = 0;
      starBtns.forEach((s) => s.classList.remove("is-active"));
      reviewFilter = "all";
      renderReviews();
      showToast("Thanks — your review was posted!");
    });
  }

  /* ===========================================================
     FAQ ACCORDION
     =========================================================== */
  function renderFaq() {
    const wrap = document.getElementById("hdFaq");
    wrap.innerHTML = hotel.faqs.map((f, i) => `
      <div class="hd-faq-item" data-faq="${i}">
        <button type="button" class="hd-faq-q">
          <span>${f.q}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <div class="hd-faq-a"><p>${f.a}</p></div>
      </div>
    `).join("");

    wrap.querySelectorAll(".hd-faq-item").forEach((item) => {
      const q = item.querySelector(".hd-faq-q");
      const a = item.querySelector(".hd-faq-a");
      q.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");
        wrap.querySelectorAll(".hd-faq-item").forEach((it) => { it.classList.remove("is-open"); it.querySelector(".hd-faq-a").style.maxHeight = null; });
        if (!isOpen) { item.classList.add("is-open"); a.style.maxHeight = a.scrollHeight + "px"; }
      });
    });
  }

  /* ===========================================================
     SIMILAR HOTELS
     =========================================================== */
  function renderSimilar() {
    const wrap = document.getElementById("hdSimilar");
    wrap.innerHTML = hotel.similar.map((id) => {
      const h = HOTELS[id];
      if (!h) return "";
      return `
      <a class="hd-similar-card" href="hotels-details.html?id=${id}">
        <img src="${h.images[0]}" alt="${h.name}" />
        <div class="hd-similar-card__body">
          <div class="hd-similar-card__name">${h.name}</div>
          <div class="hd-similar-card__loc">${h.location}</div>
          <div class="hd-similar-card__foot">
            <span class="hd-similar-card__price">$${h.priceFrom}/night</span>
            <span class="hd-similar-card__rating">★ ${h.rating.toFixed(1)}</span>
          </div>
        </div>
      </a>`;
    }).join("");
    wrap.querySelectorAll("img").forEach((img) => safeImg(img, "TripNest"));
  }

  /* ===========================================================
     BOOKING SIDEBAR
     =========================================================== */
  function initBookingSidebar() {
    const roomSelect = document.getElementById("bkRoom");
    roomSelect.innerHTML = hotel.rooms.map((r, i) => `<option value="${i}">${r.name} — $${r.price}/night</option>`).join("");

    const today = new Date();
    const inD = new Date(today); inD.setDate(inD.getDate() + 7);
    const outD = new Date(inD); outD.setDate(outD.getDate() + 2);
    const fmt = (d) => d.toISOString().split("T")[0];
    document.getElementById("bkCheckin").value = fmt(inD);
    document.getElementById("bkCheckout").value = fmt(outD);

    ["bkCheckin", "bkCheckout", "bkGuests", "bkRoom"].forEach((id) => {
      document.getElementById(id).addEventListener("change", () => {
        if (id === "bkRoom") { selectedRoomIndex = Number(roomSelect.value); renderRooms(); }
        updateBreakdown();
      });
    });

    updateBreakdown();

    document.getElementById("btnBookNow").addEventListener("click", () => {
      const nights = getNights();
      if (nights <= 0) { showToast("Check-out must be after check-in"); return; }
      const room = hotel.rooms[selectedRoomIndex];
      const total = calcTotal();
      document.getElementById("bookModalSummary").innerHTML = `
        <div><span>Hotel</span><b>${hotel.name}</b></div>
        <div><span>Room</span><b>${room.name}</b></div>
        <div><span>Check-in</span><b>${document.getElementById("bkCheckin").value}</b></div>
        <div><span>Check-out</span><b>${document.getElementById("bkCheckout").value}</b></div>
        <div><span>Guests</span><b>${document.getElementById("bkGuests").value}</b></div>
        <div><span>Nights</span><b>${nights}</b></div>
        <div><span>Total</span><b>$${total.toFixed(2)}</b></div>
      `;
      document.getElementById("bookModalOverlay").classList.add("is-open");
      showToast("Room held — check your reservation summary");
    });
    document.getElementById("bookModalClose").addEventListener("click", () => document.getElementById("bookModalOverlay").classList.remove("is-open"));
    document.getElementById("bookModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "bookModalOverlay") document.getElementById("bookModalOverlay").classList.remove("is-open");
    });
  }

  function getNights() {
    const inD = new Date(document.getElementById("bkCheckin").value);
    const outD = new Date(document.getElementById("bkCheckout").value);
    return Math.round((outD - inD) / 86400000);
  }

  function calcTotal() {
    const nights = Math.max(getNights(), 0);
    const room = hotel.rooms[selectedRoomIndex];
    const subtotal = room.price * nights;
    const taxes = subtotal * 0.12;
    return subtotal + taxes;
  }

  function updateBreakdown() {
    const nights = getNights();
    const room = hotel.rooms[selectedRoomIndex];
    const subtotal = Math.max(nights, 0) * room.price;
    const taxes = subtotal * 0.12;
    const total = subtotal + taxes;

    document.getElementById("hdSidebarPrice").textContent = `$${room.price}`;

    document.getElementById("hdBreakdown").innerHTML = `
      <div class="hd-breakdown-row"><span>${room.name} × ${Math.max(nights, 0)} night${nights === 1 ? "" : "s"}</span><span>$${subtotal.toFixed(2)}</span></div>
      <div class="hd-breakdown-row"><span>Taxes &amp; fees (12%)</span><span>$${taxes.toFixed(2)}</span></div>
      <div class="hd-breakdown-row is-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    `;
  }

  /* ===========================================================
     WISHLIST / COMPARE / SHARE
     =========================================================== */
  function initQuickActions() {
    const wishBtn = document.getElementById("btnWishlist");
    wishBtn.addEventListener("click", () => {
      const on = wishBtn.getAttribute("aria-pressed") !== "true";
      wishBtn.setAttribute("aria-pressed", String(on));
      showToast(on ? "Added to wishlist" : "Removed from wishlist");
    });

    const compareBtn = document.getElementById("btnCompare");
    compareBtn.addEventListener("click", () => {
      const on = compareBtn.getAttribute("aria-pressed") !== "true";
      compareBtn.setAttribute("aria-pressed", String(on));
      showToast(on ? "Added to compare list" : "Removed from compare list");
    });

    document.getElementById("btnShare").addEventListener("click", async () => {
      const url = window.location.href;
      if (navigator.share) {
        try { await navigator.share({ title: hotel.name, url }); } catch (e) { /* cancelled */ }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard");
      } else {
        showToast(url);
      }
    });
  }

  /* ===========================================================
     CUSTOM CURSOR / MAGNETIC / RIPPLE / SMOOTH SCROLL
     (mirrors js/hotels.js conventions for visual consistency)
     =========================================================== */
  function initMotionLayer() {
    if (window.gsap) {
      gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
      document.querySelectorAll("[data-scroll-to]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          const target = document.querySelector(el.getAttribute("data-scroll-to"));
          if (!target) return;
          gsap.to(window, { duration: 1, scrollTo: { y: target, offsetY: 84 }, ease: "power3.inOut" });
        });
      });

      if (!prefersReducedMotion) {
        gsap.utils.toArray(".hd-card").forEach((card) => {
          gsap.from(card, {
            opacity: 0, y: 30, duration: 0.6, ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 88%" }
          });
        });
      }

      if (!prefersReducedMotion && window.matchMedia("(pointer:fine)").matches) {
        document.querySelectorAll("[data-magnetic]").forEach((btn) => {
          btn.addEventListener("mousemove", (e) => {
            const rect = btn.getBoundingClientRect();
            gsap.to(btn, { x: (e.clientX - rect.left - rect.width / 2) * 0.3, y: (e.clientY - rect.top - rect.height / 2) * 0.3, duration: 0.4, ease: "power2.out" });
          });
          btn.addEventListener("mouseleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" }));
        });
      }
    }

    document.querySelectorAll(".btn, .hd-room__select, .hd-write-review-btn").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        const size = Math.max(rect.width, rect.height);
        ripple.style.position = "absolute";
        ripple.style.borderRadius = "50%";
        ripple.style.background = "rgba(255,255,255,.45)";
        ripple.style.pointerEvents = "none";
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        ripple.style.transform = "scale(0)";
        ripple.style.opacity = "1";
        ripple.style.transition = "transform .6s ease, opacity .6s ease";
        btn.style.position = btn.style.position || "relative";
        btn.style.overflow = "hidden";
        btn.appendChild(ripple);
        requestAnimationFrame(() => { ripple.style.transform = "scale(2.2)"; ripple.style.opacity = "0"; });
        window.setTimeout(() => ripple.remove(), 650);
      });
    });

    const cursor = document.getElementById("cursor");
    const isTouch = window.matchMedia("(hover: none)").matches;
    if (cursor && !isTouch) {
      let mx = 0, my = 0, cx = 0, cy = 0;
      window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });
      (function animateCursor() {
        cx += (mx - cx) * 0.18;
        cy += (my - cy) * 0.18;
        cursor.style.transform = `translate(${cx}px, ${cy}px)`;
        requestAnimationFrame(animateCursor);
      })();
      document.querySelectorAll("a, button, select, input, .hd-similar-card, .hd-room").forEach((el) => {
        el.addEventListener("mouseenter", () => {
          if (el.matches(".hd-similar-card, .hd-room")) cursor.classList.add("hover-card");
          else cursor.classList.add("hover-btn");
        });
        el.addEventListener("mouseleave", () => cursor.classList.remove("hover-card", "hover-btn"));
      });
      window.addEventListener("mousedown", () => cursor.classList.add("click"));
      window.addEventListener("mouseup", () => cursor.classList.remove("click"));
    }
  }

  /* ===========================================================
     INIT
     =========================================================== */
  const boot = () => {
    renderHeader();
    renderGallery();
    initGalleryTabs();
    initTour360Section();
    initVideoTour();
    initLightbox();
    renderAmenities();
    renderRooms();
    renderPolicies();
    renderAttractions();
    renderMap();
    renderReviews();
    initWriteReview();
    renderFaq();
    renderSimilar();
    initBookingSidebar();
    initQuickActions();
    initMotionLayer();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
});
