

/**
 * TripNest - Luxury Destinations Application Engine
 * File Name: destinations.js
 */

document.addEventListener('DOMContentLoaded', () => {

  // 0. GSAP INITIALIZATION & PRELOADER
  gsap.registerPlugin(ScrollTrigger);

  window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      preloader.classList.add('fade-out');
      // Hero GSAP Entrance Animation
      gsap.from('.gsap-reveal', {
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: 'power3.out'
      });
    }
  });

  // GSAP ScrollTrigger Section Reveal Batch
  gsap.utils.toArray('.gsap-scroll').forEach((elem) => {
    gsap.from(elem, {
      scrollTrigger: {
        trigger: elem,
        start: 'top 85%',
        toggleActions: 'play none none reverse'
      },
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out'
    });
  });

  // 1. HERO ATMOSPHERE PARALLAX ON MOUSEMOVE
  const heroSection = document.getElementById('hero');
  const props = document.querySelectorAll('.hero-parallax-props .prop');

  if (heroSection) {
    heroSection.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      props.forEach((prop) => {
        const speed = parseFloat(prop.getAttribute('data-depth')) || 0.1;
        const x = (clientX - centerX) * speed * 0.1;
        const y = (clientY - centerY) * speed * 0.1;
        prop.style.transform = `translate(${x}px, ${y}px)`;
      });
    });
  }

  // 2. HERO SLIDER AUTO-TRANSITION
  const slides = document.querySelectorAll('.hero-slide');
  let currentSlide = 0;

  if (slides.length > 0) {
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 5500);
  }

  // 3. MASTER DATASET OF 60+ DESTINATIONS
  const globalDestinations = [
    // EUROPE
    { id: 1, name: 'Paris', country: 'France', flag: '🇫🇷', continent: 'europe', price: 850, rating: 4.9, reviews: 1240, season: 'Apr - Oct', weather: '18°C Mild', duration: '5 Days', style: 'Luxury', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=80', desc: 'The City of Light with romantic Eiffel views, Louvre art, and fine gastronomy.' },
    { id: 2, name: 'Rome', country: 'Italy', flag: '🇮🇹', continent: 'europe', price: 780, rating: 4.8, reviews: 980, season: 'May - Sep', weather: '24°C Warm', duration: '4 Days', style: 'Historical', img: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80', desc: 'Eternal city filled with ancient Colosseum ruins, Vatican treasures, and gelato.' },
    { id: 3, name: 'Santorini', country: 'Greece', flag: '🇬🇷', continent: 'europe', price: 1100, rating: 4.9, reviews: 1510, season: 'May - Oct', weather: '26°C Sunny', duration: '6 Days', style: 'Honeymoon', img: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=600&q=80', desc: 'Whitewashed cliffside villas overlooking deep blue Aegean caldera waters.' },
    { id: 4, name: 'Swiss Alps', country: 'Switzerland', flag: '🇨🇭', continent: 'europe', price: 1299, rating: 5.0, reviews: 890, season: 'Dec - Mar', weather: '-2°C Snow', duration: '7 Days', style: 'Mountains', img: 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=600&q=80', desc: 'Snow-capped alpine peaks, luxury ski chalets, and scenic mountain trains.' },
    { id: 5, name: 'Venice', country: 'Italy', flag: '🇮🇹', continent: 'europe', price: 820, rating: 4.8, reviews: 760, season: 'Apr - Jun', weather: '21°C Mild', duration: '3 Days', style: 'Honeymoon', img: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=600&q=80', desc: 'Enchanting waterways, historic gondola rides, and grand Italian palaces.' },
    { id: 6, name: 'Florence', country: 'Italy', flag: '🇮🇹', continent: 'europe', price: 760, rating: 4.8, reviews: 620, season: 'May - Sep', weather: '23°C Sunny', duration: '4 Days', style: 'Historical', img: 'https://images.unsplash.com/photo-1543429776-2782fc8e1acd?auto=format&fit=crop&w=600&q=80', desc: 'Cradle of Renaissance art featuring Michelangelo Duomo and Tuscan winelands.' },
    { id: 7, name: 'London', country: 'United Kingdom', flag: '🇬🇧', continent: 'europe', price: 890, rating: 4.8, reviews: 1100, season: 'May - Sep', weather: '19°C Mild', duration: '5 Days', style: 'Historical', img: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=600&q=80', desc: 'Royal palaces, Big Ben, West End theatre shows, and world-class museums.' },
    { id: 8, name: 'Barcelona', country: 'Spain', flag: '🇪🇸', continent: 'europe', price: 740, rating: 4.8, reviews: 930, season: 'May - Oct', weather: '25°C Sunny', duration: '5 Days', style: 'Beach', img: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=600&q=80', desc: 'Mediterranean coast city famed for Gaudí architecture, beaches, and tapas bars.' },

    // ASIA
    { id: 9, name: 'Bali', country: 'Indonesia', flag: '🇮🇩', continent: 'asia', price: 620, rating: 4.9, reviews: 1850, season: 'Apr - Oct', weather: '28°C Warm', duration: '7 Days', style: 'Honeymoon', img: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=600&q=80', desc: 'Island of the Gods featuring jungle Ubud villas, rice terraces, and surf beaches.' },
    { id: 10, name: 'Kyoto', country: 'Japan', flag: '🇯🇵', continent: 'asia', price: 940, rating: 4.9, reviews: 1310, season: 'Mar - May', weather: '19°C Spring', duration: '5 Days', style: 'Historical', img: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80', desc: 'Japan’s cultural heart with thousand-year temples, geishas, and cherry blossoms.' },
    { id: 11, name: 'Tokyo', country: 'Japan', flag: '🇯🇵', continent: 'asia', price: 990, rating: 4.9, reviews: 1620, season: 'Oct - Dec', weather: '16°C Clear', duration: '6 Days', style: 'Luxury', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80', desc: 'Futuristic neon skyline met with serene ancient Shinto shrines and sushi spots.' },
    { id: 12, name: 'Maldives', country: 'Maldives', flag: '🇲🇻', continent: 'asia', price: 1850, rating: 5.0, reviews: 1420, season: 'Nov - Apr', weather: '29°C Sunny', duration: '5 Days', style: 'Luxury', img: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=600&q=80', desc: 'Private overwater bungalows suspended over crystal bioluminescent ocean lagoons.' },
    { id: 13, name: 'Dubai', country: 'UAE', flag: '🇦🇪', continent: 'asia', price: 920, rating: 4.9, reviews: 1180, season: 'Nov - Mar', weather: '27°C Sunny', duration: '5 Days', style: 'Luxury', img: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=80', desc: 'Ultramodern skyscrapers, luxury desert glamping safaris, and high-end shopping.' },

    // NORTH AMERICA
    { id: 14, name: 'New York', country: 'USA', flag: '🇺🇸', continent: 'north-america', price: 890, rating: 4.8, reviews: 1400, season: 'Apr - Jun', weather: '22°C Clear', duration: '5 Days', style: 'Luxury', img: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=600&q=80', desc: 'Times Square lights, Broadway shows, Central Park strolls, and world-class dining.' },
    { id: 15, name: 'Banff', country: 'Canada', flag: '🇨🇦', continent: 'north-america', price: 890, rating: 4.9, reviews: 920, season: 'Jun - Aug', weather: '20°C Fresh', duration: '6 Days', style: 'Nature', img: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=600&q=80', desc: 'Turquoise glacial lakes, Canadian Rocky mountain wilderness, and pine forests.' },

    // SOUTH AMERICA
    { id: 16, name: 'Machu Picchu', country: 'Peru', flag: '🇵🇪', continent: 'south-america', price: 950, rating: 5.0, reviews: 1120, season: 'Apr - Oct', weather: '18°C Mild', duration: '5 Days', style: 'Historical', img: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=600&q=80', desc: 'Ancient Incan sanctuary resting high among Andes cloud forest peaks.' },
    { id: 17, name: 'Rio de Janeiro', country: 'Brazil', flag: '🇧🇷', continent: 'south-america', price: 790, rating: 4.8, reviews: 880, season: 'Dec - Mar', weather: '29°C Sunny', duration: '6 Days', style: 'Beach', img: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=600&q=80', desc: 'Christ the Redeemer mountain views, Copacabana sands, and Carnival rhythm.' },

    // AFRICA
    { id: 18, name: 'Serengeti', country: 'Tanzania', flag: '🇹🇿', continent: 'africa', price: 1350, rating: 5.0, reviews: 790, season: 'Jun - Oct', weather: '26°C Dry', duration: '7 Days', style: 'Wildlife', img: 'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=600&q=80', desc: 'Great Wildebeest Migration safari with Big Five game drives and luxury lodges.' },

    // OCEANIA
    { id: 19, name: 'Sydney', country: 'Australia', flag: '🇦🇺', continent: 'oceania', price: 980, rating: 4.9, reviews: 1150, season: 'Sep - Nov', weather: '23°C Sunny', duration: '6 Days', style: 'Beach', img: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=600&q=80', desc: 'Harbour Opera House vistas, Bondi surf breaks, and coastal cliffwalks.' }
  ];

  // Grid State
  let activeFilteredData = [...globalDestinations];
  let currentDisplayLimit = 9;

  const masterGrid = document.getElementById('destinations-master-grid');
  const btnLoadMore = document.getElementById('btn-load-more');
  const statusLabel = document.getElementById('grid-status-label');

  // 4. RENDER DESTINATION CARDS
  function renderMasterGrid() {
    if (!masterGrid) return;
    masterGrid.innerHTML = '';

    const slice = activeFilteredData.slice(0, currentDisplayLimit);

    if (slice.length === 0) {
      masterGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
          <h3 style="font-size: 1.5rem; color: #0f172a;">No Luxury Destinations Found</h3>
          <p style="color: #64748b; margin-top: 8px;">Try clearing search keywords or choosing 'All Continents'.</p>
        </div>
      `;
      if (btnLoadMore) btnLoadMore.style.display = 'none';
      if (statusLabel) statusLabel.textContent = 'Showing 0 Destinations';
      return;
    }

    slice.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'card-3d-luxury';
      card.innerHTML = `
        <div class="c-media-box">
          <img src="${item.img}" alt="${item.name}" loading="lazy" />
          <div class="c-badges-top">
            <span class="c-flag">${item.flag} ${item.country}</span>
            <div class="c-actions">
              <button class="c-action-btn" title="Add to Wishlist" onclick="this.classList.toggle('active')">♥</button>
            </div>
          </div>
        </div>

        <div class="c-body">
          <div class="c-sub">
            <span>${item.continent}</span>
            <span>⭐ ${item.rating} (${item.reviews})</span>
          </div>

          <h3 class="c-title">${item.name}</h3>
          <p class="c-desc">${item.desc}</p>

          <div class="c-chips">
            <span class="c-chip">📅 ${item.season}</span>
            <span class="c-chip">🌤️ ${item.weather}</span>
            <span class="c-chip">⏱️ ${item.duration}</span>
          </div>

          ${item.hotels !== undefined ? `<div class="c-links">
            <span>🏨 ${item.hotels} hotel${Number(item.hotels) === 1 ? '' : 's'}</span>
            ${Number(item.packages) > 0 ? `<a href="packages.html?dest=${encodeURIComponent(item.name)}">🎒 ${item.packages} package${Number(item.packages) === 1 ? '' : 's'}</a>` : '<span>🎒 no packages yet</span>'}
          </div>` : ''}

          <div class="c-foot">
            <div class="c-price">
              $${item.price} <small>/person</small>
            </div>
            <a href="plan-trip.html?dest=${encodeURIComponent(item.destId || item.name)}" class="btn-gradient btn-sm ripple-btn">Plan Trip</a>
          </div>
        </div>
      `;
      masterGrid.appendChild(card);
    });

    init3DTilt();

    if (statusLabel) {
      statusLabel.textContent = `Showing ${Math.min(currentDisplayLimit, activeFilteredData.length)} of ${activeFilteredData.length} Destinations`;
    }

    if (btnLoadMore) {
      btnLoadMore.style.display = currentDisplayLimit >= activeFilteredData.length ? 'none' : 'inline-flex';
    }
  }

  renderMasterGrid();

  // ---- Destinations database nunchi load avthayi (server ledu ante static data alaage untundi) ----
  const staticByName = new Map(globalDestinations.map((d) => [d.name, d]));
  const mapRow = (r) => {
    const o = staticByName.get(r.name) || {};
    return {
      id: o.id || r.dest_id, name: r.name, country: r.country, flag: r.flag || o.flag || '🌍',
      continent: r.continent || o.continent, price: Number(r.price), rating: Number(r.rating),
      reviews: r.reviews_count || o.reviews || 0, season: r.best_season || o.season,
      weather: r.weather || o.weather || '', duration: r.duration || o.duration || '',
      style: r.style || o.style, img: r.img_url || o.img, desc: r.description || o.desc || '',
      destId: r.dest_id, hotels: r.hotels_count, packages: r.packages_count   // hub counts (undefined for search results)
    };
  };
  // search-filters.js DB search results ni ikkada grid lo chupistundi
  window.tnShowDestinations = (rows) => {
    activeFilteredData = rows.map(mapRow);
    currentDisplayLimit = 9;
    renderMasterGrid();
  };
  fetch('/api/destinations').then((r) => (r.ok ? r.json() : [])).then((rows) => {
    if (!rows.length) return;
    globalDestinations.splice(0, globalDestinations.length, ...rows.map(mapRow));
    activeFilteredData = [...globalDestinations];
    currentDisplayLimit = 9;
    renderMasterGrid();
  }).catch(() => {});

  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      currentDisplayLimit += 6;
      renderMasterGrid();
    });
  }

  // 5. CONTINENT PILLS FILTER
  const continentPills = document.querySelectorAll('.pill-btn');
  continentPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      continentPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const target = pill.getAttribute('data-continent');
      if (target === 'all') {
        activeFilteredData = [...globalDestinations];
      } else {
        activeFilteredData = globalDestinations.filter((item) => item.continent === target);
      }
      currentDisplayLimit = 9;
      renderMasterGrid();
    });
  });

  // 6. AI SEARCH FINDER FORM SUBMIT
  const aiForm = document.getElementById('ai-search-form');
  if (aiForm) {
    aiForm.addEventListener('submit', () => {
      const keyword = document.getElementById('ai-keyword').value.toLowerCase().trim();
      const country = document.getElementById('ai-country').value.toLowerCase().trim();
      const continent = document.getElementById('ai-continent').value;
      const budget = document.getElementById('ai-budget').value;
      const weather = document.getElementById('ai-weather').value;
      const style = document.getElementById('ai-style').value;
      const minRating = document.getElementById('ai-rating').value;

      activeFilteredData = globalDestinations.filter((item) => {
        const matchK = !keyword || item.name.toLowerCase().includes(keyword) || item.desc.toLowerCase().includes(keyword);
        const matchC = !country || item.country.toLowerCase().includes(country);
        const matchCont = continent === 'all' || item.continent === continent;
        const matchB = budget === 'all' || (budget === '5000' ? item.price >= 2500 : item.price <= parseInt(budget));
        const matchW = weather === 'all' || item.weather.toLowerCase().includes(weather);
        const matchS = style === 'all' || item.style === style;
        const matchR = minRating === 'all' || item.rating >= parseFloat(minRating);

        return matchK && matchC && matchCont && matchB && matchW && matchS && matchR;
      });

      currentDisplayLimit = 9;
      renderMasterGrid();

      const gridSec = document.getElementById('destinations-grid-section');
      if (gridSec) gridSec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // 7. 3D CARD TILT ON MOUSEMOVE
  function init3DTilt() {
    const cards = document.querySelectorAll('.card-3d-luxury');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        card.style.transform = `perspective(1000px) rotateX(${-y / 25}deg) rotateY(${x / 25}deg) translateY(-6px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0deg)';
      });
    });
  }

  // 8. INTERACTIVE MAP HOVER POPUP
  const continents = document.querySelectorAll('.svg-continent');
  const mBadge = document.getElementById('map-region-badge');
  const mTitle = document.getElementById('map-region-title');
  const mCities = document.getElementById('m-cities');
  const mBudget = document.getElementById('m-budget');
  const mWeather = document.getElementById('m-weather');
  const mSeason = document.getElementById('m-season');
  const mAttractions = document.getElementById('m-attractions');
  const mCount = document.getElementById('m-count');
  const btnExplorer = document.getElementById('btn-explore-continent');

  let activeMapRegion = 'europe';

  continents.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      activeMapRegion = item.getAttribute('data-continent');
      if (mBadge) mBadge.textContent = 'REGION SELECTED';
      if (mTitle) mTitle.textContent = item.getAttribute('data-name');
      if (mCities) mCities.textContent = item.getAttribute('data-cities');
      if (mBudget) mBudget.textContent = item.getAttribute('data-budget') + ' / person';
      if (mWeather) mWeather.textContent = item.getAttribute('data-weather');
      if (mSeason) mSeason.textContent = item.getAttribute('data-season');
      if (mAttractions) mAttractions.textContent = item.getAttribute('data-attractions');
      if (mCount) mCount.textContent = item.getAttribute('data-count');
    });
  });

  if (btnExplorer) {
    btnExplorer.addEventListener('click', () => {
      const targetPill = document.querySelector(`.pill-btn[data-continent="${activeMapRegion}"]`);
      if (targetPill) targetPill.click();
      const gridSec = document.getElementById('destinations-grid-section');
      if (gridSec) gridSec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // 9. TRAVEL BUDGET CALCULATOR ENGINE
  const rangeTravelers = document.getElementById('range-travelers');
  const rangeDays = document.getElementById('range-days');
  const calcTier = document.getElementById('calc-tier');
  const calcFlight = document.getElementById('calc-flight');

  const lblTravelers = document.getElementById('lbl-travelers');
  const lblDays = document.getElementById('lbl-days');
  const calcTotalVal = document.getElementById('calc-total-val');

  const lblFlightCost = document.getElementById('lbl-flight-cost');
  const lblStayCost = document.getElementById('lbl-stay-cost');
  const lblFoodCost = document.getElementById('lbl-food-cost');

  const segFlight = document.getElementById('seg-flight');
  const segStay = document.getElementById('seg-stay');
  const segFood = document.getElementById('seg-food');

  function updateCalculator() {
    if (!rangeTravelers || !rangeDays || !calcTier || !calcFlight) return;

    const travelers = parseInt(rangeTravelers.value);
    const days = parseInt(rangeDays.value);
    const tierPerDay = parseInt(calcTier.value);
    const flightPerPerson = parseInt(calcFlight.value);

    if (lblTravelers) lblTravelers.textContent = travelers;
    if (lblDays) lblDays.textContent = `${days} Days`;

    const totalFlight = flightPerPerson * travelers;
    const totalStay = tierPerDay * days * travelers;
    const totalFood = 75 * days * travelers; // fixed food/activities allowance
    const grandTotal = totalFlight + totalStay + totalFood;

    if (calcTotalVal) calcTotalVal.textContent = `$${grandTotal.toLocaleString()}`;
    if (lblFlightCost) lblFlightCost.textContent = `$${totalFlight.toLocaleString()}`;
    if (lblStayCost) lblStayCost.textContent = `$${totalStay.toLocaleString()}`;
    if (lblFoodCost) lblFoodCost.textContent = `$${totalFood.toLocaleString()}`;

    // Update Segments
    if (segFlight && segStay && segFood && grandTotal > 0) {
      segFlight.style.width = `${(totalFlight / grandTotal) * 100}%`;
      segStay.style.width = `${(totalStay / grandTotal) * 100}%`;
      segFood.style.width = `${(totalFood / grandTotal) * 100}%`;
    }
  }

  [rangeTravelers, rangeDays, calcTier, calcFlight].forEach((el) => {
    if (el) el.addEventListener('input', updateCalculator);
  });

  updateCalculator();

  // 10. VISA REQUIREMENTS CHECKER ENGINE
  const visaOrigin = document.getElementById('visa-origin');
  const visaTarget = document.getElementById('visa-target');
  const btnCheckVisa = document.getElementById('btn-check-visa');

  const visaBadge = document.getElementById('visa-badge');
  const visaTitle = document.getElementById('visa-title');
  const visaDesc = document.getElementById('visa-desc');

  if (btnCheckVisa && visaOrigin && visaTarget) {
    btnCheckVisa.addEventListener('click', () => {
      const o = visaOrigin.value;
      const t = visaTarget.value;

      if (o === 'US' || o === 'UK' || o === 'EU' || o === 'CA') {
        if (visaBadge) { visaBadge.textContent = 'VISA FREE / 90 DAYS'; visaBadge.className = 'v-status-badge green'; }
        if (visaTitle) visaTitle.textContent = 'No Visa Required Prior To Travel';
        if (visaDesc) visaDesc.textContent = `Passport holders from ${o} can enter ${t} for tourist trips up to 90 days without a prior visa.`;
      } else {
        if (visaBadge) { visaBadge.textContent = 'E-VISA / VISA ON ARRIVAL'; visaBadge.className = 'v-status-badge green'; }
        if (visaTitle) visaTitle.textContent = 'Instant E-Visa Available';
        if (visaDesc) visaDesc.textContent = `Passport holders from ${o} can easily apply online for an e-Visa or obtain entry approval upon arrival in ${t}.`;
      }
    });
  }

  // 11. BEST TIME TO VISIT MONTH SELECTOR
  const monthData = {
    Jan: ['🌴 Bali', '🏔️ Swiss Alps', '🏖️ Phuket', '⛷️ Banff'],
    Feb: ['🎭 Rio de Janeiro', '🏝️ Maldives', '🌌 Reykjavik', '🌇 Dubai'],
    Mar: ['🌸 Kyoto', '🏛️ Rome', '🏜️ Grand Canyon', '🏰 Prague'],
    Apr: ['🇫🇷 Paris', '🇬🇷 Santorini', '🇳🇱 Amsterdam', '🇯🇵 Tokyo'],
    May: ['🇪🇸 Barcelona', '🇮🇹 Florence', '🇬🇷 Athens', '🇮🇹 Venice'],
    Jun: ['🇨🇦 Banff', '🦁 Serengeti', '🇨🇭 Swiss Alps', '🇬🇧 London'],
    Jul: ['🏖️ Santorini', '🇮🇩 Bali', '🇫🇯 Fiji', '🇨🇦 Vancouver'],
    Aug: ['🦁 Serengeti', '🇪🇸 Barcelona', '🇮🇸 Reykjavik', '🇺🇸 New York'],
    Sep: ['🇯🇵 Kyoto', '🇦🇺 Sydney', '🇮🇹 Rome', '🇵🇪 Machu Picchu'],
    Oct: ['🇯🇵 Tokyo', '🇦🇪 Dubai', '🇪🇬 Cairo', '🇺🇸 New York'],
    Nov: ['🇿🇦 Cape Town', '🇦🇪 Dubai', '🇹🇭 Phuket', '🇲🇻 Maldives'],
    Dec: ['🎄 Vienna', '⛷️ Swiss Alps', '🏝️ Maldives', '🇦🇺 Sydney']
  };

  const mPills = document.querySelectorAll('.m-pill');
  const modeltitle = document.getElementById('m-display-title');
  const mChips = document.getElementById('m-chips-container');

  mPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      mPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const m = pill.getAttribute('data-month');
      const list = monthData[m] || monthData['Jan'];

      if (modeltitle)modeltitle.textContent = `Recommended Destinations for ${m}`;
      
      if (mChips) {
        mChips.innerHTML = list.map((item) => `<span class="m-chip-item">${item}</span>`).join('');
      }
    });
  });

  const defaultMonth = document.querySelector('.m-pill[data-month="Jan"]');
  if (defaultMonth) defaultMonth.click();

  // 12. TRENDING TRACK CAROUSEL CONTROLS
  const track = document.getElementById('trending-slider-track');
  const btnPrev = document.getElementById('btn-trend-prev');
  const btnNext = document.getElementById('btn-trend-next');
  let trendPos = 0;

  if (track && btnPrev && btnNext) {
    btnNext.addEventListener('click', () => {
      trendPos = Math.min(trendPos + 340, 680);
      track.style.transform = `translateX(-${trendPos}px)`;
    });

    btnPrev.addEventListener('click', () => {
      trendPos = Math.max(trendPos - 340, 0);
      track.style.transform = `translateX(-${trendPos}px)`;
    });
  }

  // 13. ANIMATED STATISTICS COUNTER ON SCROLL
  const statNumbers = document.querySelectorAll('.stat-number');
  let counterDone = false;

  const statsBox = document.getElementById('stats-counter-box');
  if (statsBox) {
    ScrollTrigger.create({
      trigger: statsBox,
      start: 'top 85%',
      onEnter: () => {
        if (!counterDone) {
          counterDone = true;
          statNumbers.forEach((counter) => {
            const target = +counter.getAttribute('data-target');
            gsap.to(counter, {
              innerHTML: target,
              duration: 2,
              snap: { innerHTML: 1 },
              ease: 'power2.out'
            });
          });
        }
      }
    });
  }

  // 14. MASONRY GALLERY LIGHTBOX
  const galleryItems = document.querySelectorAll('.masonry-item');
  const lightbox = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  galleryItems.forEach((item) => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-lightbox');
      if (lightbox && lightboxImg) {
        lightboxImg.src = url;
        lightbox.classList.add('active');
      }
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
      if (lightbox) lightbox.classList.remove('active');
    });
  }

  // 15. TESTIMONIALS CAROUSEL
  const testItems = document.querySelectorAll('.test-item');
  const testDots = document.querySelectorAll('#test-dots-container .dot');
  let currentTestIndex = 0;

  function setTestimonial(index) {
    testItems.forEach((item) => item.classList.remove('active'));
    testDots.forEach((dot) => dot.classList.remove('active'));

    testItems[index].classList.add('active');
    testDots[index].classList.add('active');
    currentTestIndex = index;
  }

  testDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      setTestimonial(parseInt(dot.getAttribute('data-index')));
    });
  });

  setInterval(() => {
    currentTestIndex = (currentTestIndex + 1) % testItems.length;
    setTestimonial(currentTestIndex);
  }, 6000);

  // 16. RIPPLE BUTTON EFFECT
  const rippleBtns = document.querySelectorAll('.ripple-btn');
  rippleBtns.forEach((btn) => {
    btn.addEventListener('click', function (e) {
      const circle = document.createElement('span');
      circle.classList.add('ripple-circle');

      const rect = btn.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);

      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
      circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;

      const prev = btn.querySelector('.ripple-circle');
      if (prev) prev.remove();

      btn.appendChild(circle);
    });
  });

  // 17. NEWSLETTER SUBMISSION
  const newsForm = document.getElementById('newsletter-form');
  const newsSuccess = document.getElementById('news-success');

  if (newsForm) {
    newsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      newsForm.style.display = 'none';
      if (newsSuccess) newsSuccess.classList.remove('hidden');
    });
  }
});

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


