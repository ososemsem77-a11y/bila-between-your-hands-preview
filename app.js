(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const STATIC_MODE = window.BILA_STATIC_MODE === true;
  const state = { categories: [], places: [], stats: {}, city: { lat: 31.1728, lng: 31.221 }, category: '', query: '', favoritesOnly: false, favorites: new Set(JSON.parse(localStorage.getItem('bila-favorites') || '[]')), location: null, nearby: false, map: null, markers: [], adminTab: 'stats', adminPlaces: [], submissions: [], installPrompt: null, toastTimer: null };
  const modalRoot = $('#modal-root');
  const DEMO_MAP_LINK = 'https://maps.app.goo.gl/c5wqJjDN22RCpNiFA?g_st=aw';

  if (STATIC_MODE) {
    const notice = document.createElement('aside');
    notice.className = 'static-preview-banner';
    notice.setAttribute('role', 'status');
    notice.textContent = 'نسخة عرض مؤقتة على GitHub Pages: الأماكن الحقيقية لم تُضف بعد، والإدارة والاقتراحات والحفظ المشترك تحتاج إلى خادم.';
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
  function haversine(a, b) { const rad = n => n * Math.PI / 180; const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function distanceText(place) { if (!state.location || place.lat == null || place.lng == null) return ''; const km = haversine(state.location, { lat: Number(place.lat), lng: Number(place.lng) }); return km < 1 ? `${Math.max(1, Math.round(km * 1000))} م منك` : `${km.toFixed(1)} كم منك`; }
  function verificationText(status) { return status === 'verified' ? 'معلومة موثّقة' : status === 'needs_location' ? 'الموقع يحتاج تحديدًا' : 'معلومة تحتاج مراجعة'; }

  function renderCategories() {
    const counts = Object.fromEntries(state.categories.map(c => [c.id, state.places.filter(p => p.category === c.id).length]));
    $('#category-grid').innerHTML = state.categories.map(c => `<button type="button" class="category-tile ${state.category === c.id ? 'selected' : ''}" data-category="${esc(c.id)}" style="--tile-color:${esc(c.color)}"><span class="category-icon">${esc(c.icon)}</span><strong>${esc(c.name)}</strong><small>${counts[c.id] || 0} مكان</small></button>`).join('');
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
    if (state.nearby && state.location) places.sort((a, b) => {
      const da = a.lat == null || a.lng == null ? Infinity : haversine(state.location, { lat: +a.lat, lng: +a.lng });
      const db = b.lat == null || b.lng == null ? Infinity : haversine(state.location, { lat: +b.lat, lng: +b.lng }); return da - db;
    });
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
      const c = category(place.category); const distance = distanceText(place);
      const cover = place.image && /^https:\/\//i.test(place.image) ? `<img src="${esc(place.image)}" alt="صورة ${esc(place.name)}" loading="lazy" onerror="this.remove()">` : `<span class="cover-pattern"></span><span class="cover-icon">${esc(c.icon)}</span>`;
      return `<article class="place-card" tabindex="0" role="button" data-place-id="${esc(place.id)}" aria-label="تفاصيل ${esc(place.name)}"><div class="place-cover" style="background:linear-gradient(135deg,${esc(c.color)}55,#d7e4d4)">${cover}<span class="place-badge">${esc(c.name)}</span><button class="favorite-toggle ${state.favorites.has(place.id) ? 'active' : ''}" data-favorite="${esc(place.id)}" type="button" aria-label="${state.favorites.has(place.id) ? 'إزالة من المفضلة' : 'أضف للمفضلة'}">${state.favorites.has(place.id) ? '★' : '☆'}</button></div><div class="place-body"><div class="place-meta"><span>${esc(place.type || c.name)}</span><span>${esc(verificationText(place.verification))}</span></div><h3>${esc(place.name)}</h3><div class="place-address"><span>⌖</span><span>${esc([place.zone, place.address].filter(Boolean).join(' · ') || 'العنوان قيد الإضافة')}</span></div><div class="place-card-foot"><span>${distance ? `⌖ ${esc(distance)}` : esc(place.hours || 'بيانات الموقع متاحة')}</span><a href="${esc(mapUrl(place))}" target="_blank" rel="noopener" data-stop-card>الاتجاهات ↗</a></div></div></article>`;
    }).join('');
    $('#empty-state').hidden = places.length > 0;
    $('#place-list').hidden = places.length === 0;
    if (places.length > 12) $('#results-count').textContent = `(${places.length.toLocaleString('ar-EG')} مكان — أول 12 نتيجة)`;
    renderMap();
  }
  function renderMap() {
    $('#map-place-count').textContent = state.places.length ? `${state.places.filter(p => p.lat != null && p.lng != null).length} موقع محدد على الخريطة` : 'أضف أماكن بإحداثياتها لعرضها على الخريطة';
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
    const c = category(place.category); const image = place.image && /^https:\/\//i.test(place.image) ? `<img src="${esc(place.image)}" alt="${esc(place.name)}">` : `<span>${esc(c.icon)}</span>`;
    const phone = place.phone ? `<div class="detail-line"><span>☎</span><div><small>رقم الهاتف</small><a href="tel:${esc(place.phone.replace(/[^+\d]/g, ''))}">${esc(place.phone)}</a></div></div>` : '';
    const hours = place.hours ? `<div class="detail-line"><span>◷</span><div><small>مواعيد العمل</small>${esc(place.hours)}</div></div>` : '';
    const description = place.description ? `<div class="detail-line"><span>✦</span><div><small>عن المكان</small>${esc(place.description)}</div></div>` : '';
    const address = [place.zone, place.address].filter(Boolean).join(' · ') || 'العنوان التفصيلي قيد الإضافة';
    showModal(`<div class="place-detail-hero">${image}</div><div class="modal-head"><span class="section-kicker">${esc(c.name)}</span><h2>${esc(place.name)}</h2><div class="detail-badges"><span class="detail-badge">${esc(place.type || c.name)}</span><span class="detail-badge">${esc(verificationText(place.verification))}</span></div></div><div class="detail-line"><span>⌖</span><div><small>العنوان والمنطقة</small>${esc(address)}</div></div>${phone}${hours}${description}<div class="detail-actions"><a href="${esc(mapUrl(place))}" target="_blank" rel="noopener">افتح الاتجاهات ↗</a>${place.phone ? `<a class="secondary-action" href="tel:${esc(place.phone.replace(/[^+\d]/g, ''))}">اتصال ☎</a>` : ''}<button class="secondary-action" data-share-place="${esc(place.id)}" type="button">شارك المكان ↗</button><button class="secondary-action" data-report-place="${esc(place.id)}" type="button">بلّغ عن تعديل</button></div><p class="form-note">آخر تحديث: ${place.updatedAt ? new Date(place.updatedAt).toLocaleDateString('ar-EG') : 'غير متاح'} · ${esc(verificationText(place.verification))}</p>`);
  }
  function openSuggest(place = null) {
    if (STATIC_MODE) {
      showModal(`<div class="modal-head"><span class="section-kicker">نسخة عرض مؤقتة</span><h2>إرسال الاقتراحات غير مفعّل</h2><p>GitHub Pages يعرض ملفات الواجهة فقط. استقبال الاقتراحات وحفظها لمراجعتها يحتاج إلى تشغيل الخادم.</p></div><div class="form-actions"><button class="primary-button" data-close-modal type="button">حسنًا</button></div>`);
      return;
    }
    const isEdit = !!place;
    const categoryOptions = state.categories.map(c => `<option value="${esc(c.id)}" ${place?.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const content = `<div class="modal-head"><span class="section-kicker">مشاركة مجتمعية</span><h2>${isEdit ? 'اقترح تعديل معلومة' : 'اقترح إضافة مكان'}</h2><p>${isEdit ? 'ملاحظتك هتوصل للإدارة للمراجعة قبل التحديث.' : 'كل معلومة بتساعد حد يوصل أسرع. اقتراحك هيراجعه فريق المشروع قبل النشر.'}</p></div><form id="suggest-form"><input type="hidden" name="type" value="${isEdit ? 'edit' : 'add'}"><input type="hidden" name="placeId" value="${esc(place?.id || '')}"><div class="form-grid"><div class="form-field"><label for="s-name">اسم المكان *</label><input id="s-name" name="name" required maxlength="120" value="${esc(place?.name || '')}" placeholder="مثال: صيدلية …"></div><div class="form-field"><label for="s-category">التصنيف${isEdit ? '' : ' *'}</label><select id="s-category" name="category" ${isEdit ? '' : 'required'}><option value="">اختار التصنيف</option>${categoryOptions}</select></div><div class="form-field"><label for="s-type">نوع الخدمة</label><input id="s-type" name="typeName" maxlength="80" value="${esc(place?.type || '')}" placeholder="صيدلية، معمل، مطعم…"></div><div class="form-field"><label for="s-zone">المنطقة أو القرية</label><input id="s-zone" name="zone" maxlength="100" value="${esc(place?.zone || '')}" placeholder="مثال: مدينة بيلا"></div><div class="form-field full"><label for="s-address">العنوان${isEdit ? '' : ' *'}</label><input id="s-address" name="address" maxlength="240" ${isEdit ? '' : 'required'} value="${esc(place?.address || '')}" placeholder="الشارع أو وصف يساعد على الوصول"></div><div class="form-field"><label for="s-phone">رقم الهاتف إن وُجد</label><input id="s-phone" name="phone" maxlength="40" value="${esc(place?.phone || '')}" dir="ltr" placeholder=""></div><div class="form-field"><label for="s-source">رابط أو مصدر للمعلومة</label><input id="s-source" name="source" maxlength="500" placeholder="رابط صفحة أو موقع"></div><div class="form-field full"><label for="s-description">معلومات إضافية</label><textarea id="s-description" name="description" maxlength="1000" placeholder="إيه اللي يساعد الإدارة تتأكد من المعلومة؟"></textarea></div></div><div class="form-actions"><button class="primary-button" type="submit">إرسال للمراجعة <span>←</span></button><button class="plain-button" type="button" data-close-modal>إلغاء</button></div><p class="form-note">لا يتم نشر أي اقتراح تلقائيًا. فريق المشروع يراجع البيانات أولًا.</p><div id="suggest-message"></div></form>`;
    showModal(content);
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast('اتشال من المفضلة.'); }
    else { state.favorites.add(id); toast('اتضاف للمفضلة.'); }
    localStorage.setItem('bila-favorites', JSON.stringify([...state.favorites])); renderPlaces();
  }
  function findLocation() {
    if (!navigator.geolocation) return toast('المتصفح لا يدعم تحديد الموقع.');
    toast('بنحدد موقعك…');
    navigator.geolocation.getCurrentPosition(position => {
      state.location = { lat: position.coords.latitude, lng: position.coords.longitude }; state.nearby = true; state.favoritesOnly = false;
      $('#nearby-button').classList.add('active'); renderPlaces(); toast('اترتبت الأماكن حسب قربها منك.');
    }, error => toast(error.code === 1 ? 'فعّل إذن الموقع من إعدادات المتصفح.' : 'تعذر تحديد موقعك الآن.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  async function share(url = location.href, title = 'بيلا بين إيديك') {
    try { if (navigator.share) await navigator.share({ title, text: 'دليلك الرقمي لأماكن وخدمات بيلا', url }); else { await navigator.clipboard.writeText(url); toast('اتنسخ الرابط، شاركه مع اللي تعرفهم.'); } }
    catch (error) { if (error.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('اتنسخ الرابط.'); } catch { toast('انسخ الرابط من شريط العنوان.'); } } }
  }
  function openQr() {
    const url = location.origin + location.pathname;
    showModal(`<div class="modal-head"><span class="section-kicker">امسح • اكتشف • وصل</span><h2>رمز QR لدليلك</h2><p>شارك الرمز بعد نشر الموقع على رابط ثابت.</p></div><div class="qr-box"><div id="qr-code" style="display:flex;justify-content:center;min-height:220px;align-items:center;color:var(--muted);font-size:10px">جارٍ إنشاء الرمز…</div><div class="qr-url">${esc(url)}</div></div><div class="form-actions"><button id="copy-site-link" class="primary-button" type="button">انسخ رابط الموقع</button><button class="plain-button" data-close-modal type="button">إغلاق</button></div><p class="form-note">يظهر الرمز برابط الموقع الحالي. بعد النشر، افتح الموقع المنشور وأنشئ الرمز من هناك للطباعة.</p>`);
    const draw = () => { if (window.QRCode) { const host = $('#qr-code'); host.textContent = ''; new QRCode(host, { text: url, width: 190, height: 190, colorDark: '#123d35', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); } else $('#qr-code').textContent = 'اتصل بالإنترنت لإنشاء رمز QR.'; };
    if (window.QRCode) draw(); else { const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; script.onload = draw; script.onerror = draw; document.head.appendChild(script); }
  }

  async function openAdmin() {
    if (STATIC_MODE) {
      showModal(`<div class="modal-head"><span class="section-kicker">نسخة عرض مؤقتة</span><h2>لوحة الإدارة غير متاحة</h2><p>لوحة الإدارة وتعديل بيانات الدليل تعملان في النسخة الكاملة التي تحتاج إلى خادم وقاعدة بيانات.</p></div><div class="form-actions"><button class="primary-button" data-close-modal type="button">حسنًا</button></div>`);
      return;
    }
    try { await api('/api/admin/status'); return showAdmin(); }
    catch { showAdminLogin(); }
  }
  function showAdminLogin(message = '') {
    showModal(`<div class="modal-head"><span class="section-kicker">بيلا بين إيديك</span><h2>دخول إدارة الدليل</h2><p>من هنا فريق المشروع بيراجع الأماكن والمساهمات.</p></div><form id="admin-login-form"><div class="form-field"><label for="admin-password">كلمة المرور</label><input id="admin-password" name="password" type="password" required autocomplete="current-password"></div><div id="admin-login-message" class="form-error">${esc(message)}</div><div class="form-actions"><button class="primary-button" type="submit">دخول الإدارة <span>←</span></button><button class="plain-button" data-close-modal type="button">إلغاء</button></div><p class="form-note">في التشغيل المحلي الأول، كلمة المرور التجريبية موضحة في ملف README_AR.</p></form>`);
  }
  async function showAdmin() {
    try {
      const [p, s, metrics] = await Promise.all([api('/api/admin/places'), api('/api/admin/submissions'), api('/api/admin/stats')]);
      state.adminPlaces = p.places || []; state.submissions = s.submissions || []; state.stats = metrics.stats || state.stats;
      const panel = state.adminTab === 'places' ? adminPlacesPanel() : state.adminTab === 'suggestions' ? adminSuggestionsPanel() : adminStatsPanel();
      showModal(`<div class="modal-head"><span class="section-kicker">مساحة فريق المشروع</span><h2>إدارة دليل بيلا</h2><p>راجع التفاصيل قبل اعتمادها. المعلومات غير المؤكدة تظهر بوضوح.</p></div><div class="admin-tabs"><button class="${state.adminTab === 'stats' ? 'active' : ''}" data-admin-tab="stats">نظرة عامة</button><button class="${state.adminTab === 'places' ? 'active' : ''}" data-admin-tab="places">الأماكن (${state.adminPlaces.length})</button><button class="${state.adminTab === 'suggestions' ? 'active' : ''}" data-admin-tab="suggestions">المساهمات (${state.submissions.filter(s => s.status === 'pending').length})</button></div><div id="admin-panel">${panel}</div><div class="form-actions"><button id="admin-logout" class="plain-button" type="button">تسجيل الخروج</button></div>`, true);
    } catch (error) { if (error.status === 401) showAdminLogin(); else toast(error.message); }
  }
  function adminStatsPanel() {
    const pending = state.submissions.filter(s => s.status === 'pending').length;
    return `<div class="admin-stat-grid"><div class="admin-stat"><strong>${state.adminPlaces.length}</strong><small>أماكن مسجلة</small></div><div class="admin-stat"><strong>${pending}</strong><small>مساهمات تنتظر المراجعة</small></div><div class="admin-stat"><strong>${state.adminPlaces.filter(p => p.verification === 'verified').length}</strong><small>أماكن تم توثيقها</small></div><div class="admin-stat"><strong>${state.stats.visits || 0}</strong><small>زيارات مسجلة</small></div><div class="admin-stat"><strong>${state.stats.searches || 0}</strong><small>عمليات بحث</small></div><div class="admin-stat"><strong>${state.stats.mapOpens || 0}</strong><small>فتح الخريطة</small></div></div><p class="form-note">الإحصائيات المجمعة لا تحفظ موقع الزائر أو بيانات تعريف شخصية.</p>`;
  }
  function adminPlacesPanel(editPlace = null) {
    const categories = state.categories.map(c => `<option value="${esc(c.id)}" ${editPlace?.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const rows = state.adminPlaces.map(p => `<div class="admin-row"><div class="admin-row-main"><strong>${esc(p.name)}</strong><small>${esc(category(p.category).name)} · ${esc(p.zone || 'منطقة غير محددة')} · ${esc(p.verification === 'verified' ? 'موثّق' : 'يحتاج مراجعة')}</small></div><button data-edit-admin-place="${esc(p.id)}">تعديل</button><button class="danger" data-delete-place="${esc(p.id)}">حذف</button></div>`).join('') || '<p class="form-note">لا توجد أماكن بعد. ابدأ بإضافة أول مكان موثوق.</p>';
    return `<form id="admin-place-form"><input type="hidden" name="id" value="${esc(editPlace?.id || '')}"><div class="form-grid"><div class="form-field"><label>اسم المكان *</label><input name="name" required value="${esc(editPlace?.name || '')}"></div><div class="form-field"><label>التصنيف *</label><select name="category" required><option value="">اختار</option>${categories}</select></div><div class="form-field"><label>نوع الخدمة</label><input name="type" value="${esc(editPlace?.type || '')}"></div><div class="form-field"><label>المنطقة أو القرية</label><input name="zone" value="${esc(editPlace?.zone || '')}"></div><div class="form-field full"><label>العنوان</label><input name="address" value="${esc(editPlace?.address || '')}"></div><div class="form-field"><label>الهاتف</label><input name="phone" dir="ltr" value="${esc(editPlace?.phone || '')}"></div><div class="form-field"><label>مواعيد العمل</label><input name="hours" value="${esc(editPlace?.hours || '')}"></div><div class="form-field"><label>Latitude</label><input name="lat" type="number" step="any" dir="ltr" value="${esc(editPlace?.lat ?? '')}"></div><div class="form-field"><label>Longitude</label><input name="lng" type="number" step="any" dir="ltr" value="${esc(editPlace?.lng ?? '')}"></div><div class="form-field full"><label>رابط صورة أو Google Maps</label><input name="image" type="url" value="${esc(editPlace?.image || '')}" placeholder="https://…"></div><div class="form-field full"><label>وصف مختصر</label><textarea name="description">${esc(editPlace?.description || '')}</textarea></div><div class="form-field"><label>حالة التحقق</label><select name="verification"><option value="needs_review" ${editPlace?.verification !== 'verified' ? 'selected' : ''}>تحتاج مراجعة</option><option value="verified" ${editPlace?.verification === 'verified' ? 'selected' : ''}>موثقة</option></select></div><div class="form-field"><label>حالة النشر</label><select name="status"><option value="published" ${editPlace?.status !== 'draft' ? 'selected' : ''}>منشور</option><option value="draft" ${editPlace?.status === 'draft' ? 'selected' : ''}>مسودة مخفية</option></select></div></div><div class="form-actions"><button class="primary-button" type="submit">${editPlace ? 'حفظ التعديل' : 'إضافة المكان'} <span>←</span></button>${editPlace ? '<button class="plain-button" type="button" data-cancel-edit-place>إلغاء التعديل</button>' : ''}</div><div id="admin-place-message"></div></form><div class="admin-list" style="margin-top:17px">${rows}</div>`;
  }
  function adminSuggestionsPanel() {
    const items = state.submissions.filter(s => s.status === 'pending');
    if (!items.length) return '<div class="empty-state"><h3>مفيش مساهمات معلقة</h3><p>هتظهر اقتراحات الناس هنا لمراجعتها.</p></div>';
    return `<div class="admin-list">${items.map(s => `<div class="admin-row"><div class="admin-row-main"><strong>${esc(s.name)} <small>(${s.type === 'edit' ? 'تعديل معلومة' : 'إضافة مكان'})</small></strong><small>${esc(category(s.category).name)} · ${esc(s.zone || '')} · ${esc(s.address || '')}${s.phone ? ` · ${esc(s.phone)}` : ''}${s.source ? ` · مصدر: ${esc(s.source)}` : ''}</small></div><button class="approve" data-review-submission="${esc(s.id)}" data-review-action="approve">اعتماد</button><button class="danger" data-review-submission="${esc(s.id)}" data-review-action="reject">رفض</button></div>`).join('')}</div>`;
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
    if (target.matches('[data-open-suggest]')) { openSuggest(); $('#mobile-menu').hidden = true; return; }
    if (target.matches('#theme-toggle')) { document.body.classList.toggle('dark'); localStorage.setItem('bila-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); return; }
    if (target.matches('#menu-toggle')) { const menu = $('#mobile-menu'); menu.hidden = !menu.hidden; return; }
    if (target.closest('#mobile-menu a')) { $('#mobile-menu').hidden = true; return; }
    if (target.matches('#share-site,#discover-share')) { share(); return; }
    if (target.matches('#nearby-button,#nearby-cta,#map-locate')) { findLocation(); if (target.matches('#map-locate') && state.map) state.map.setView(state.location || [state.city.lat, state.city.lng], 15); return; }
    if (target.matches('#favorites-button')) { state.favoritesOnly = !state.favoritesOnly; state.nearby = false; $('#nearby-button').classList.remove('active'); renderPlaces(); return; }
    if (target.matches('[data-search]')) { state.query = target.dataset.search; $('#main-search').value = state.query; renderPlaces(); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }); track('search', state.query); return; }
    if (target.matches('[data-category]')) { state.category = state.category === target.dataset.category ? '' : target.dataset.category; state.query = ''; state.favoritesOnly = false; $('#main-search').value = ''; renderCategories(); renderPlaces(); return; }
    if (target.matches('[data-favorite]')) { event.stopPropagation(); toggleFavorite(target.dataset.favorite); return; }
    if (target.matches('[data-stop-card]')) { event.stopPropagation(); return; }
    if (target.matches('[data-place-id]')) { event.preventDefault(); const place = state.places.find(p => p.id === target.dataset.placeId); if (place) showPlace(place); return; }
    if (target.matches('[data-report-place]')) { const place = state.places.find(p => p.id === target.dataset.reportPlace); openSuggest(place); return; }
    if (target.matches('[data-share-place]')) { const place = state.places.find(p => p.id === target.dataset.sharePlace); if (place) share(location.origin + location.pathname + '#place-' + encodeURIComponent(place.id), place.name); return; }
    if (target.matches('#qr-open')) { openQr(); return; }
    if (target.matches('#copy-site-link')) { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('اتنسخ رابط الدليل.'); } catch { toast('انسخ رابط الموقع من المربع.'); } return; }
    if (target.matches('#admin-open')) { openAdmin(); return; }
    if (target.matches('[data-admin-tab]')) { state.adminTab = target.dataset.adminTab; showAdmin(); return; }
    if (target.matches('#admin-logout')) { await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {}); closeModal(); toast('تم تسجيل الخروج.'); return; }
    if (target.matches('[data-edit-admin-place]')) { const place = state.adminPlaces.find(p => p.id === target.dataset.editAdminPlace); $('#admin-panel').innerHTML = adminPlacesPanel(place); return; }
    if (target.matches('[data-cancel-edit-place]')) { $('#admin-panel').innerHTML = adminPlacesPanel(); return; }
    if (target.matches('[data-delete-place]')) { if (!confirm('حذف المكان من الدليل؟')) return; try { await api('/api/admin/places/' + encodeURIComponent(target.dataset.deletePlace), { method: 'DELETE' }); await refresh(); state.adminTab = 'places'; await showAdmin(); toast('تم حذف المكان.'); } catch (error) { toast(error.message); } return; }
    if (target.matches('[data-review-submission]')) { try { await api('/api/admin/submissions/' + encodeURIComponent(target.dataset.reviewSubmission), { method: 'PATCH', body: JSON.stringify({ action: target.dataset.reviewAction }) }); await refresh(); state.adminTab = 'suggestions'; await showAdmin(); toast(target.dataset.reviewAction === 'approve' ? 'تم اعتماد الاقتراح.' : 'تم رفض الاقتراح.'); } catch (error) { toast(error.message); } return; }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeModal(); $('#mobile-menu').hidden = true; }
    if (event.key === 'Enter' && event.target.matches('.place-card')) showPlace(state.places.find(p => p.id === event.target.dataset.placeId));
  });
  modalRoot.addEventListener('click', event => { if (event.target === modalRoot) closeModal(); });
  document.addEventListener('submit', async event => {
    if (event.target.matches('#search-form')) {
      event.preventDefault(); state.query = $('#main-search').value.trim(); state.category = ''; state.favoritesOnly = false; state.nearby = false; renderCategories(); renderPlaces();
      if (state.query) track('search', state.query); document.querySelector('#directory').scrollIntoView({ behavior: 'smooth' }); return;
    }
    if (event.target.matches('#suggest-form')) {
      event.preventDefault(); const form = event.target; const payload = Object.fromEntries(new FormData(form).entries());
      try { const result = await api('/api/suggestions', { method: 'POST', body: JSON.stringify(payload) }); $('#suggest-message').className = 'form-success'; $('#suggest-message').textContent = result.message; form.reset(); toast('وصل اقتراحك للمراجعة.'); }
      catch (error) { $('#suggest-message').className = 'form-error'; $('#suggest-message').textContent = error.message; }
      return;
    }
    if (event.target.matches('#admin-login-form')) {
      event.preventDefault(); const password = new FormData(event.target).get('password');
      try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); state.adminTab = 'stats'; await showAdmin(); }
      catch (error) { $('#admin-login-message').textContent = error.message; $('#admin-password').focus(); }
      return;
    }
    if (event.target.matches('#admin-place-form')) {
      event.preventDefault(); const form = event.target; const payload = Object.fromEntries(new FormData(form).entries()); const id = payload.id; delete payload.id;
      try { await api('/api/admin/places' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); await refresh(); state.adminTab = 'places'; await showAdmin(); toast(id ? 'تم تحديث بيانات المكان.' : 'تمت إضافة المكان.'); }
      catch (error) { const box = $('#admin-place-message'); if (box) { box.className = 'form-error'; box.textContent = error.message; } }
      return;
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
