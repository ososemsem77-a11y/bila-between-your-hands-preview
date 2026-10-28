(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const STATIC_MODE = window.BILA_STATIC_MODE === true;
  const state = { categories: [], places: [], stats: {}, city: { lat: 31.1728, lng: 31.221 }, category: '', query: '', favoritesOnly: false, favorites: new Set(JSON.parse(localStorage.getItem('bila-favorites') || '[]')), map: null, markers: [], installPrompt: null, toastTimer: null };
  const modalRoot = $('#modal-root');
  const DEMO_MAP_LINK = 'https://maps.app.goo.gl/c5wqJjDN22RCpNiFA?g_st=aw';

  if (STATIC_MODE) {
    const notice = document.createElement('aside');
    notice.className = 'static-preview-banner';
    notice.setAttribute('role', 'status');
    notice.textContent = 'دليل بيلا العام: معلومات موثقة وروابط مباشرة إلى خرائط Google. تُضاف الأماكن بعد التأكد من بياناتها.';
    $('#main').prepend(notice);
  }

  function esc(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function normalized(value = '') { return String(value).toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim(); }
  async function api(url, options = {}) {
    if (STATIC_MODE) {
      if (url === '/api/bootstrap') return window.BILA_STATIC_BOOTSTRAP;
      if (url === '/api/events') return { ok: true };
      const error = new Error('هذه الميزة تحتاج إلى خادم النسخة الكاملة.');
      error.status = 503;
      throw error;
    }
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'تعذر تنفيذ الطلب.'); error.status = response.status; throw error; }
    return data;
  }
  function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove('show'), 2900); }
  function track(type) { api('/api/events', { method: 'POST', body: JSON.stringify({ type }) }).catch(() => {}); }
  function category(id) { return state.categories.find(c => c.id === id) || { name: 'مكان محلي', icon: '⌖', color: '#78946b' }; }
  function mapUrl(place) { if (place.mapsUrl && /^https:\/\//i.test(place.mapsUrl)) return place.mapsUrl; const query = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : `${place.name || ''} ${place.zone || ''} بيلا`; return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`; }
  function safeImageUrl(value) { return /^https:\/\//i.test(value || '') || /^\.(?:\/images)?\/[a-z0-9_.-]+\.svg$/i.test(value || ''); }
  function verificationText(status) { return status === 'verified' ? 'معلومة موثّقة' : status === 'needs_location' ? 'الموقع يحتاج تحديدًا' : 'معلومة تحتاج مراجعة'; }

  function renderCategories() {
    const counts = Object.fromEntries(state.categories.map(c => [c.id, state.places.filter(p => p.category === c.id).length]));
    $('#category-grid').innerHTML = state.categories.map(c => { const count = counts[c.id] || 0; return `<button type="button" class="category-tile ${state.category === c.id ? 'selected' : ''}" data-category="${esc(c.id)}" style="--tile-color:${esc(c.color)}"><span class="category-icon">${esc(c.icon)}</span><strong>${esc(c.name)}</strong><small>${count ? `${count} مكان` : 'بيانات قريبًا'}</small></button>`; }).join('');
    const options = '<option value="">كل التصنيفات</option>' + state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('#map-filter').innerHTML = options;
    $('#stat-places').textContent = state.places.length.toLocaleString('ar-EG');
    $('#stat-categories').textContent = state.categories.length.toLocaleString('ar-EG');
  }
  function filteredPlaces() {
    let places = [...state.places];
    if (state.category) places = places.filter(p => p.category === state.category);
    if (state.query) { const q = normalized(state.query); places = places.filter(p => normalized([p.name, p.type, category(p.category).name, p.zone, p.address, p.description].join(' ')).includes(q)); }
    if (state.favoritesOnly) places = places.filter(p => state.favorites.has(p.id));
    return places;
  }
  function renderPlaces() {
    const places = filteredPlaces();
    const title = state.favoritesOnly ? 'أماكنك المفضلة' : state.query ? `نتائج البحث عن «${state.query}»` : state.category ? category(state.category).name : 'أماكن مميزة في بيلا';
    $('#results-title').textContent = title;
    $('#results-count').textContent = places.length ? `(${places.length.toLocaleString('ar-EG')} مكان)` : '';
    $('#favorites-button').classList.toggle('active', state.favoritesOnly);
    $('#favorites-button').innerHTML = `<span>${state.favoritesOnly ? '★' : '☆'}</span> المفضلة`;
    const container = $('#place-list');
    container.innerHTML = places.slice(0, 12).map(place => {
      const c = category(place.category);
      const cover = safeImageUrl(place.image) ? `<img src="${esc(place.image)}" alt="رسم توضيحي لـ ${esc(place.name)}" loading="lazy" onerror="this.remove()">` : `<span class="cover-pattern"></span><span class="cover-icon">${esc(c.icon)}</span>`;
      return `<article class="place-card" tabindex="0" role="button" data-place-id="${esc(place.id)}" aria-label="تفاصيل ${esc(place.name)}"><div class="place-cover" style="background:linear-gradient(135deg,${esc(c.color)}55,#d7e4d4)">${cover}<span class="place-badge">${esc(c.name)}</span><button class="favorite-toggle ${state.favorites.has(place.id) ? 'active' : ''}" data-favorite="${esc(place.id)}" type="button" aria-label="${state.favorites.has(place.id) ? 'إزالة من المفضلة' : 'أضف للمفضلة'}">${state.favorites.has(place.id) ? '★' : '☆'}</button></div><div class="place-body"><div class="place-meta"><span>${esc(place.type || c.name)}</span><span>${esc(verificationText(place.verification))}</span></div><h3>${esc(place.name)}</h3><div class="place-address"><span>⌖</span><span>${esc([place.zone, place.address].filter(Boolean).join(' · ') || 'العنوان قيد الإضافة')}</span></div><div class="place-card-foot"><span>${esc(place.hours || 'افتح الموقع على الخريطة')}</span><a href="${esc(mapUrl(place))}" target="_blank" rel="noopener" data-stop-card>الاتجاهات ↗</a></div></div></article>`;
    }).join('');
    $('#empty-state').hidden = places.length > 0;
    $('#place-list').hidden = places.length === 0;
    if (places.length > 12) $('#results-count').textContent = `(${places.length.toLocaleString('ar-EG')} مكان — أول 12 نتيجة)`;
    renderMap();
  }
  function renderMap() {
    const mappedCount = state.places.filter(p => p.lat != null && p.lng != null).length;
    $('#map-place-count').textContent = mappedCount ? `${mappedCount} موقع محدد على الخريطة` : state.places.length ? 'روابط كل جهة تفتح موقعها على Google Maps؛ لا تتوفر إحداثيات دقيقة بعد.' : 'أضف أماكن بإحداثياتها لعرضها على الخريطة';
    if (!window.L || !state.map) return;
    state.markers.forEach(marker => marker.remove()); state.markers = [];
    const select = $('#map-filter').value;
    const places = state.places.filter(p => p.lat != null && p.lng != null && (!select || p.category === select));
    for (const place of places) {
      const c = category(place.category);
      const marker = L.marker([Number(place.lat), Number(place.lng)]).addTo(state.map);
      marker.bindPopup(`<div class="map-popup"><b>${esc(place.name)}</b><span>${esc(c.name)} · ${esc(place.zone || 'بيلا')}</span><a href="#" class="popup-details" data-place-id="${esc(place.id)}">التفاصيل ←</a></div>`);
      state.markers.push(marker);
    }
    if (state.markers.length) {
      const group = L.featureGroup(state.markers); state.map.fitBounds(group.getBounds().pad(.2), { maxZoom: 15 });
    } else state.map.setView([state.city.lat, state.city.lng], 13);
  }
  function initMap() {
    if (!window.L) { $('#map').innerHTML = `<div class="map-warning">تعذر تحميل طبقة الخريطة الآن. استخدم زر Google Maps لفتح الخريطة مباشرة.</div>`; return; }
    state.map = L.map('map', { scrollWheelZoom: false }).setView([state.city.lat, state.city.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(state.map);
    state.map.whenReady(() => setTimeout(() => state.map.invalidateSize(), 150));
    renderMap();
  }

  function showModal(content, wide = false) {
    modalRoot.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button type="button" class="modal-close" data-close-modal aria-label="إغلاق">×</button>${content}</div>`;
    modalRoot.hidden = false; document.body.style.overflow = 'hidden';
    const first = $('input,button,select,textarea', modalRoot); if (first) first.focus();
  }
  function closeModal() { modalRoot.hidden = true; modalRoot.innerHTML = ''; document.body.style.overflow = ''; }
  function showPlace(place) {
    if (!place) return;
    track('place', place.id);
    const c = category(place.category); const image = safeImageUrl(place.image) ? `<img src="${esc(place.image)}" alt="رسم توضيحي لـ ${esc(place.name)}">` : `<span>${esc(c.icon)}</span>`;
    const phone = place.phone ? `<div class="detail-line"><span>☎</span><div><small>رقم الهاتف</small><a href="tel:${esc(place.phone.replace(/[^+\d]/g, ''))}">${esc(place.phone)}</a></div></div>` : '';
    const hours = place.hours ? `<div class="detail-line"><span>◷</span><div><small>مواعيد العمل</small>${esc(place.hours)}</div></div>` : '';
    const description = place.description ? `<div class="detail-line"><span>✦</span><div><small>عن المكان</small>${esc(place.description)}</div></div>` : '';
    const source = place.source && /^https:\/\//i.test(place.source) ? `<div class="detail-line"><span>↗</span><div><small>مصدر المعلومة</small><a href="${esc(place.source)}" target="_blank" rel="noopener">افتح المصدر الرسمي</a></div></div>` : '';
    const address = [place.zone, place.address].filter(Boolean).join(' · ') || 'العنوان التفصيلي قيد الإضافة';
    showModal(`<div class="place-detail-hero">${image}</div><div class="modal-head"><span class="section-kicker">${esc(c.name)}</span><h2>${esc(place.name)}</h2><div class="detail-badges"><span class="detail-badge">${esc(place.type || c.name)}</span><span class="detail-badge">${esc(verificationText(place.verification))}</span></div></div><div class="detail-line"><span>⌖</span><div><small>العنوان والمنطقة</small>${esc(address)}</div></div>${phone}${hours}${description}${source}<div class="detail-actions"><a href="${esc(mapUrl(place))}" target="_blank" rel="noopener">افتح الاتجاهات ↗</a>${place.phone ? `<a class="secondary-action" href="tel:${esc(place.phone.replace(/[^+\d]/g, ''))}">اتصال ☎</a>` : ''}<button class="secondary-action" data-share-place="${esc(place.id)}" type="button">شارك المكان ↗</button></div><p class="form-note">${place.updatedAt ? `آخر تحديث: ${new Date(place.updatedAt).toLocaleDateString('ar-EG')} · ` : ''}${esc(verificationText(place.verification))}</p>`);
  }
  function toggleFavorite(id) {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast('اتشال من المفضلة.'); }
    else { state.favorites.add(id); toast('اتضاف للمفضلة.'); }
    localStorage.setItem('bila-favorites', JSON.stringify([...state.favorites])); renderPlaces();
  }
  async function share(url = location.href, title = 'بيلا بين إيديك') {
    try { if (navigator.share) await navigator.share({ title, text: 'دليلك الرقمي لأماكن وخدمات بيلا', url }); else { await navigator.clipboard.writeText(url); toast('اتنسخ الرابط، شاركه مع اللي تعرفهم.'); } }
    catch (error) { if (error.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('اتنسخ الرابط.'); } catch { toast('انسخ الرابط من شريط العنوان.'); } } }
  }
  function openQr() {
    const url = location.origin + location.pathname;
    const qrNote = STATIC_MODE ? 'هذا رمز لرابط الموقع العام الحالي، ويمكن مشاركته مباشرة.' : 'يظهر الرمز برابط الموقع الحالي. بعد النشر، افتح الموقع المنشور وأنشئ الرمز من هناك للطباعة.';
    showModal(`<div class="modal-head"><span class="section-kicker">امسح • اكتشف • وصل</span><h2>رمز QR لدليلك</h2><p>شارك الرمز مع أهل بيلا وزوارها.</p></div><div class="qr-box"><div id="qr-code" style="display:flex;justify-content:center;min-height:220px;align-items:center;color:var(--muted);font-size:10px">جارٍ إنشاء الرمز…</div><div class="qr-url">${esc(url)}</div></div><div class="form-actions"><button id="copy-site-link" class="primary-button" type="button">انسخ رابط الموقع</button><button class="plain-button" data-close-modal type="button">إغلاق</button></div><p class="form-note">${esc(qrNote)}</p>`);
    const draw = () => { if (window.QRCode) { const host = $('#qr-code'); host.textContent = ''; new QRCode(host, { text: url, width: 190, height: 190, colorDark: '#123d35', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); } else $('#qr-code').textContent = 'اتصل بالإنترنت لإنشاء رمز QR.'; };
    if (window.QRCode) draw(); else { const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; script.onload = draw; script.onerror = draw; document.head.appendChild(script); }
  }

  async function refresh() {
    try {
      const data = await api('/api/bootstrap');
      state.categories = data.categories || []; state.places = data.places || []; state.stats = data.stats || {}; state.city = data.city || state.city;
      renderCategories(); renderPlaces();
    } catch { $('#category-grid').innerHTML = '<div class="loading-card">تعذر الاتصال بخادم الدليل. حدّث الصفحة وحاول مرة أخرى.</div>'; }
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest('button,a,[data-place-id],[data-category]');
    if (!target) return;
    if (target.matches('[data-close-modal]')) { closeModal(); return; }
    if (target === modalRoot) { closeModal(); return; }
    if (target.matches('#theme-toggle')) { document.body.classList.toggle('dark'); localStorage.setItem('bila-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); return; }
    if (target.matches('#menu-toggle')) { const menu = $('#mobile-menu'); menu.hidden = !menu.hidden; return; }
    if (target.closest('#mobile-menu a')) { $('#mobile-menu').hidden = true; return; }
    if (target.matches('#share-site,#discover-share')) { share(); return; }
    if (target.matches('#favorites-button')) { state.favoritesOnly = !state.favoritesOnly; renderPlaces(); return; }
    if (target.matches('[data-search]')) { state.query = target.dataset.search; $('#main-search').value = state.query; renderPlaces(); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }); track('search', state.query); return; }
    if (target.matches('[data-category]')) { state.category = state.category === target.dataset.category ? '' : target.dataset.category; state.query = ''; state.favoritesOnly = false; $('#main-search').value = ''; renderCategories(); renderPlaces(); return; }
    if (target.matches('[data-favorite]')) { event.stopPropagation(); toggleFavorite(target.dataset.favorite); return; }
    if (target.matches('[data-stop-card]')) { event.stopPropagation(); return; }
    if (target.matches('[data-place-id]')) { event.preventDefault(); const place = state.places.find(p => p.id === target.dataset.placeId); if (place) showPlace(place); return; }
    if (target.matches('[data-share-place]')) { const place = state.places.find(p => p.id === target.dataset.sharePlace); if (place) share(location.origin + location.pathname + '#place-' + encodeURIComponent(place.id), place.name); return; }
    if (target.matches('#qr-open')) { openQr(); return; }
    if (target.matches('#copy-site-link')) { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('اتنسخ رابط الدليل.'); } catch { toast('انسخ رابط الموقع من المربع.'); } return; }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeModal(); $('#mobile-menu').hidden = true; }
    if (event.key === 'Enter' && event.target.matches('.place-card')) showPlace(state.places.find(p => p.id === event.target.dataset.placeId));
  });
  modalRoot.addEventListener('click', event => { if (event.target === modalRoot) closeModal(); });
  document.addEventListener('submit', async event => {
    if (event.target.matches('#search-form')) {
      event.preventDefault(); state.query = $('#main-search').value.trim(); state.category = ''; state.favoritesOnly = false; renderCategories(); renderPlaces();
      if (state.query) track('search', state.query); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }); return;
    }
  });
  $('#map-filter').addEventListener('change', renderMap);
  $('#year').textContent = new Date().getFullYear();
  if (localStorage.getItem('bila-theme') === 'dark') document.body.classList.add('dark');
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register(new URL('sw.js', location.href).toString()).catch(() => {});
  document.addEventListener('DOMContentLoaded', () => {});
  refresh().then(() => { initMap(); openHashPlace(); });
  function openHashPlace() {
    const match = location.hash.match(/^#place-(.+)$/);
    if (match) { const id = decodeURIComponent(match[1]); const place = state.places.find(p => p.id === id); if (place) showPlace(place); }
  }
  window.addEventListener('hashchange', openHashPlace);
  track('visit');
})();
