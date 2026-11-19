const CONFIG = window.STEAM_CONFIG || {};
const SCHOOL = CONFIG.SCHOOL_NAME || 'Yadika 13';
const SUPABASE_READY = Boolean(
  CONFIG.SUPABASE_URL &&
  CONFIG.SUPABASE_ANON_KEY &&
  !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT') &&
  !CONFIG.SUPABASE_ANON_KEY.includes('PASTE_')
);

const STATUS = {
  pending: { label: 'Menunggu pengambilan kunci', short: 'Menunggu', desc: 'Pesanan diterima. Petugas akan menuju lokasi parkir/kelas untuk mengambil kunci.' },
  key_collected: { label: 'Kunci sudah diambil', short: 'Kunci diambil', desc: 'Kunci motor sudah diterima petugas.' },
  washing: { label: 'Sedang di-steam', short: 'Sedang dicuci', desc: 'Motor sedang dalam proses pencucian.' },
  ready: { label: 'Selesai · siap diambil', short: 'Siap diambil', desc: 'Pencucian selesai. Silakan ambil motor sesuai arahan petugas.' },
  completed: { label: 'Motor sudah diserahkan', short: 'Selesai', desc: 'Motor telah diserahkan kembali kepada pemilik.' },
  cancelled: { label: 'Pesanan dibatalkan', short: 'Dibatalkan', desc: 'Pesanan ini dibatalkan.' }
};
const PARKING = {
  A: 'Dekat kantin SMK / dekat lapangan futsal Yadika 13',
  B: 'Parkiran luas dekat bengkel TKR',
  C: 'Parkiran atas dekat lapangan basket Yadika 13'
};
const PAYMENT_TIMING = {
  key_pickup: 'Saat petugas mengambil kunci di kelas',
  motor_pickup: 'Saat mengambil motor setelah selesai di-steam'
};

const root = document.getElementById('app-root');
const toastRoot = document.getElementById('toast-root');
let supabase = null;
let realtimeChannel = null;
let state = {
  user: null,
  profile: null,
  orders: [],
  settings: { service_price: null, qris_image_url: '' },
  activeTab: 'orders',
  authMode: 'login',
  authNotice: null,
  search: '',
  filter: 'all',
  demo: !SUPABASE_READY,
  currentModal: null,
  loading: false
};

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const initials = name => String(name || 'S').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
const rupiah = value => value == null || value === '' ? 'Tarif belum ditetapkan' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const dateText = value => {
  try { return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  catch { return '—'; }
};
const paymentName = value => value === 'qris' ? 'QRIS' : 'Cash';
const timingName = value => PAYMENT_TIMING[value] || '—';
const roleName = role => role === 'admin' ? 'Administrator' : role === 'staff' ? 'Petugas' : 'Siswa';
const statusPill = status => `<span class="status-pill status-${escapeHTML(status)}">${escapeHTML(STATUS[status]?.short || status)}</span>`;
const isStaff = () => ['staff', 'admin'].includes(state.profile?.role);
const isAdmin = () => state.profile?.role === 'admin';

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function noticeMarkup() {
  if (!state.authNotice) return '';
  return `<div class="notice ${state.authNotice.type === 'error' ? 'error' : 'success'}">${escapeHTML(state.authNotice.text)}</div>`;
}
function setNotice(type, text) { state.authNotice = { type, text }; render(); }

function authView() {
  const demo = !SUPABASE_READY;
  root.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-visual">
        <div class="brand"><div class="brand-mark">S</div><div><div class="brand-name" style="color:white">STEAM SEKOLAH</div><div class="brand-sub" style="color:#a8c1cc">${escapeHTML(SCHOOL.toUpperCase())}</div></div></div>
        <div>
          <div class="auth-tag">LAYANAN STEAM MOTOR SEKOLAH</div>
          <h1>Motor bersih,<br>aktivitas makin nyaman.</h1>
          <p>Pesan layanan steam tanpa perlu mencari petugas. Petugas akan mengambil kunci ke kelas, memproses motor, lalu memberi kabar saat motor siap diambil.</p>
          <div class="auth-benefits"><span>✓ Pesan dari HP</span><span>✓ Lacak status</span><span>✓ Cash / QRIS</span></div>
        </div>
        <div class="auth-bottom">Layanan internal warga sekolah · ${escapeHTML(SCHOOL)}</div>
      </section>
      <section class="auth-side"><div class="auth-card">
        <div class="eyebrow" style="color:var(--teal-dark)">${demo ? 'MODE COBA' : 'AREA ANGGOTA'}</div>
        <h2>${demo ? 'Coba aplikasi' : (state.authMode === 'signup' ? 'Buat akun siswa' : 'Selamat datang') }</h2>
        <p>${demo ? 'Pilih tampilan siswa atau petugas untuk mencoba alur pemesanan. Data demo hanya tersimpan di browser ini.' : (state.authMode === 'signup' ? 'Daftarkan akun menggunakan email aktif dan data sekolah.' : 'Masuk menggunakan akun Steam Sekolah yang sudah terdaftar.')}</p>
        ${noticeMarkup()}
        ${demo ? demoLoginMarkup() : realAuthMarkup()}
      </div></section>
    </main>`;
}
function demoLoginMarkup() {
  return `<div class="demo-actions">
    <button class="btn btn-primary btn-block" data-action="demo-login" data-role="student">Masuk sebagai Siswa <span>Buat pesanan & pantau status →</span></button>
    <button class="btn btn-dark btn-block" data-action="demo-login" data-role="staff">Masuk sebagai Petugas <span>Kelola antrean & pembayaran →</span></button>
    <button class="btn btn-outline btn-block" data-action="demo-login" data-role="admin">Masuk sebagai Admin <span>Kelola tarif & QRIS →</span></button>
  </div>
  <div class="demo-warning"><b>Mode demo lokal.</b> Pesanan tidak terkirim ke petugas sungguhan dan tidak dibagikan ke HP lain. Hubungkan Supabase melalui file <b>config.js</b> untuk penggunaan sekolah.</div>`;
}
function realAuthMarkup() {
  const signup = state.authMode === 'signup';
  return `<div class="auth-switch"><button class="${!signup ? 'active' : ''}" data-action="auth-mode" data-mode="login">Masuk</button><button class="${signup ? 'active' : ''}" data-action="auth-mode" data-mode="signup">Daftar</button></div>
  <form class="auth-form" id="auth-form">
    ${signup ? `<div class="field"><label>Nama lengkap <span class="req">*</span></label><input name="full_name" required placeholder="Nama sesuai data sekolah" autocomplete="name"></div>
    <div class="field"><label>Kelas <span class="req">*</span></label><input name="class_name" required placeholder="Contoh: XI TKR 1"></div>
    <div class="field"><label>Nomor HP <span class="req">*</span></label><input name="phone" required inputmode="tel" placeholder="08xxxxxxxxxx"></div>` : ''}
    <div class="field"><label>Email <span class="req">*</span></label><input type="email" name="email" required placeholder="nama@email.com" autocomplete="email"></div>
    <div class="field"><label>Password <span class="req">*</span></label><input type="password" name="password" required minlength="6" placeholder="Minimal 6 karakter" autocomplete="${signup ? 'new-password' : 'current-password'}"></div>
    <button class="btn btn-primary btn-block" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Memproses...' : signup ? 'Buat akun' : 'Masuk ke aplikasi'}</button>
  </form>
  <div class="help" style="margin-top:14px">${signup ? 'Dengan mendaftar, akun baru otomatis mendapat akses siswa.' : 'Belum punya akun? Pilih tab Daftar.'}</div>`;
}

function appShell(content) {
  const name = state.profile?.full_name || state.user?.email || 'Pengguna';
  const tabs = isStaff()
    ? `<button class="nav-tab ${state.activeTab === 'orders' ? 'active' : ''}" data-action="tab" data-tab="orders">Antrean pesanan</button>${isAdmin() ? `<button class="nav-tab ${state.activeTab === 'settings' ? 'active' : ''}" data-action="tab" data-tab="settings">Pengaturan</button>` : ''}`
    : `<button class="nav-tab ${state.activeTab === 'orders' ? 'active' : ''}" data-action="tab" data-tab="orders">Pesan & riwayat</button>`;
  root.innerHTML = `<div class="shell">
    <header class="topbar"><div class="brand"><div class="brand-mark">S</div><div><div class="brand-name">STEAM SEKOLAH</div><div class="brand-sub">${escapeHTML(SCHOOL.toUpperCase())}</div></div></div>
      <div class="top-actions"><div class="user-chip"><div class="avatar">${escapeHTML(initials(name))}</div><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(roleName(state.profile?.role))}${state.demo ? ' · Demo' : ''}</small></div></div><button class="btn btn-light" data-action="logout">Keluar</button></div>
    </header>
    <main class="page"><nav class="nav-tabs">${tabs}</nav>${content}<div class="footer-note">Steam Sekolah · ${escapeHTML(SCHOOL)} · Gunakan layanan dengan tertib dan jaga keamanan kunci kendaraan.</div></main>
  </div>`;
}

function hero(title, subtitle, emoji = '🫧') {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">${isStaff() ? 'PANEL OPERASIONAL' : 'LAYANAN WARGA SEKOLAH'}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="hero-art"><span>${emoji}</span></div></section>`;
}
function statCard(icon, number, label) { return `<div class="stat-card"><div class="stat-icon">${icon}</div><div><strong>${number}</strong><small>${label}</small></div></div>`; }
function orderCounts(orders) {
  return {
    active: orders.filter(o => !['completed', 'cancelled'].includes(o.status)).length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length
  };
}
function studentHome() {
  const firstName = escapeHTML((state.profile?.full_name || 'Siswa').split(' ')[0]);
  const orders = [...state.orders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const counts = orderCounts(orders);
  const form = `<section class="panel"><div class="panel-head"><div><h2>Form pemesanan steam</h2><p>Isi data motor dan lokasi parkir dengan benar.</p></div><span class="status-pill status-washing">Pesan layanan</span></div>
    <div class="panel-body"><form id="order-form">
      <div class="form-grid">
        <div class="field"><label>Nama lengkap <span class="req">*</span></label><input name="student_name" required maxlength="90" placeholder="Nama lengkap siswa" value="${escapeHTML(state.profile?.full_name || '')}"></div>
        <div class="field"><label>Kelas <span class="req">*</span></label><input name="class_name" required maxlength="40" placeholder="Contoh: XI TKR 1" value="${escapeHTML(state.profile?.class_name || '')}"></div>
        <div class="field"><label>Nomor HP <span class="req">*</span></label><input name="phone" required inputmode="tel" maxlength="20" placeholder="08xxxxxxxxxx" value="${escapeHTML(state.profile?.phone || '')}"></div>
        <div class="field"><label>Plat motor <span class="req">*</span></label><input name="plate_number" required maxlength="15" placeholder="Contoh: B 1234 XYZ" style="text-transform:uppercase"></div>
        <div class="field full"><label>Jenis motor <span class="req">*</span></label><input name="vehicle_type" required maxlength="60" placeholder="Contoh: Honda Beat, Yamaha NMAX, Vario 160"></div>
        <div class="field full"><label>Lokasi parkir <span class="req">*</span></label><div class="location-list">
          ${Object.entries(PARKING).map(([key, desc]) => `<label class="location-choice"><input type="radio" name="parking_location" value="${key}" required><span class="location-badge">${key}</span><span><strong>Lokasi ${key}</strong><small>${escapeHTML(desc)}</small></span></label>`).join('')}
        </div></div>
        <div class="field full"><label>Metode pembayaran <span class="req">*</span></label><div class="choice-grid">
          <label class="choice"><input type="radio" name="payment_method" value="cash" checked><span><strong>💵 Cash</strong><small>Bayar tunai kepada petugas.</small></span></label>
          <label class="choice"><input type="radio" name="payment_method" value="qris"><span><strong>▦ QRIS</strong><small>Scan QRIS resmi yang ditunjukkan petugas.</small></span></label>
        </div></div>
        <div class="field full"><label>Waktu pembayaran <span class="req">*</span></label><div class="choice-grid">
          <label class="choice"><input type="radio" name="payment_timing" value="key_pickup" checked><span><strong>🔑 Saat kunci diambil</strong><small>Bayar ketika petugas datang ke kelas mengambil kunci.</small></span></label>
          <label class="choice"><input type="radio" name="payment_timing" value="motor_pickup"><span><strong>🏍️ Saat motor diambil</strong><small>Bayar ketika mengambil motor setelah selesai di-steam.</small></span></label>
        </div></div>
        <div class="field full"><label>Catatan untuk petugas (opsional)</label><textarea name="notes" maxlength="300" placeholder="Contoh: motor berada di baris paling ujung..."></textarea></div>
      </div>
      <div class="info-strip" style="margin-top:15px"><span>ⓘ</span><span><b>Alur layanan:</b> petugas mengambil kunci di kelas → motor dicuci → status berubah menjadi siap diambil. Pembayaran dikonfirmasi oleh petugas pada waktu yang kamu pilih.</span></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Mengirim...' : 'Kirim pesanan →'}</button><span class="help">Data bertanda * wajib diisi.</span></div>
    </form></div></section>`;
  const history = `<section class="panel"><div class="panel-head"><div><h2>Pesanan saya</h2><p>Pantau perkembangan pesanan steam motor.</p></div><span class="status-pill">${orders.length} pesanan</span></div><div class="panel-body">${orders.length ? `<div class="order-list">${orders.map(studentOrderCard).join('')}</div>` : `<div class="empty"><div class="empty-icon">🧾</div><strong>Belum ada pesanan</strong><p>Pesanan yang kamu buat akan muncul di sini beserta status dan informasi pembayarannya.</p></div>`}</div></section>`;
  return `${hero('Halo, ' + firstName + '!', 'Pesan layanan steam dari HP. Petugas akan mengambil kunci ke kelas sesuai lokasi dan menyiapkan motor saat selesai.', '🏍️')}
    <div class="stats-grid">${statCard('🫧', counts.active, 'PESANAN AKTIF')}${statCard('✨', counts.ready, 'SIAP DIAMBIL')}${statCard('✓', counts.completed, 'SELESAI')}</div>
    <div class="content-grid">${form}${history}</div>`;
}
function studentOrderCard(order) {
  const due = order.amount_due == null ? 'Tarif belum ditetapkan' : rupiah(order.amount_due);
  return `<article class="order-card"><div class="order-top"><div><div class="order-id">${escapeHTML(String(order.id).slice(0,8).toUpperCase())} · ${escapeHTML(order.plate_number)}</div><div class="order-date">${dateText(order.created_at)}</div></div>${statusPill(order.status)}</div>
    <div style="font-size:10px;color:#738797;margin-top:10px;line-height:1.5">${escapeHTML(STATUS[order.status]?.desc || '')}</div>
    <div class="order-details"><div class="detail-item"><small>Jenis motor</small><strong>${escapeHTML(order.vehicle_type)}</strong></div><div class="detail-item"><small>Lokasi parkir</small><strong>Lokasi ${escapeHTML(order.parking_location)} · ${escapeHTML(PARKING[order.parking_location] || '')}</strong></div><div class="detail-item"><small>Pembayaran</small><strong>${paymentName(order.payment_method)} · ${escapeHTML(order.payment_status === 'paid' ? 'Sudah dibayar' : 'Belum dibayar')}</strong></div><div class="detail-item"><small>Waktu bayar</small><strong>${escapeHTML(order.payment_timing === 'key_pickup' ? 'Saat kunci diambil' : 'Saat motor diambil')}</strong></div><div class="detail-item"><small>Tarif</small><strong>${escapeHTML(due)}</strong></div></div>
    <div class="order-foot"><div class="payment-note">${order.payment_status === 'paid' ? '<strong>✓ Pembayaran terkonfirmasi</strong>' : 'Pembayaran akan dikonfirmasi petugas pada waktu yang dipilih.'}</div></div></article>`;
}

function staffHome() {
  const all = [...state.orders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const counts = orderCounts(all);
  const filtered = all.filter(order => {
    const matchFilter = state.filter === 'all' || order.status === state.filter;
    const q = state.search.toLowerCase();
    const matchSearch = !q || [order.student_name, order.class_name, order.plate_number, order.phone].some(x => String(x || '').toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });
  const list = filtered.length ? filtered.map(staffOrderCard).join('') : `<div class="empty"><div class="empty-icon">📭</div><strong>Tidak ada pesanan yang cocok</strong><p>Pesanan baru dari siswa akan muncul di daftar ini.</p></div>`;
  return `${hero('Kelola antrean steam', 'Pantau pesanan masuk, ambil kunci ke kelas, perbarui proses pencucian, dan konfirmasi pembayaran.', '🧽')}
    <div class="stats-grid">${statCard('📥', all.filter(o => o.status === 'pending').length, 'PESANAN MASUK')}${statCard('🫧', all.filter(o => o.status === 'washing').length, 'SEDANG DICUCI')}${statCard('✨', counts.ready, 'SIAP DIAMBIL')}</div>
    <section class="panel"><div class="panel-head"><div><h2>Daftar pesanan</h2><p>Perbarui status sesuai kondisi motor sebenarnya.</p></div><span class="status-pill">${all.length} total</span></div>
      <div class="panel-body"><div class="filterbar"><div><strong>Antrean layanan</strong><small>Data diperbarui saat ada perubahan pesanan.</small></div><div class="toolbar"><input id="order-search" type="search" placeholder="Cari nama / plat..." value="${escapeHTML(state.search)}"><select id="order-filter"><option value="all" ${state.filter==='all'?'selected':''}>Semua status</option>${Object.entries(STATUS).map(([key,val])=>`<option value="${key}" ${state.filter===key?'selected':''}>${val.short}</option>`).join('')}</select></div></div><div class="staff-list">${list}</div></div>
    </section>`;
}
function staffOrderCard(order) {
  const next = nextStatus(order);
  const dueNow = (order.payment_timing === 'key_pickup' && order.status === 'key_collected') || (order.payment_timing === 'motor_pickup' && order.status === 'ready');
  const canAdvance = next && !((order.payment_timing === 'key_pickup' && order.status === 'key_collected' && order.payment_status !== 'paid') || (order.payment_timing === 'motor_pickup' && order.status === 'ready' && order.payment_status !== 'paid'));
  const progressButton = next ? `<button class="btn btn-primary btn-mini" data-action="advance-order" data-id="${escapeHTML(order.id)}" ${canAdvance ? '' : 'disabled'}>${escapeHTML(next.label)}</button>` : '';
  const paymentButton = dueNow && order.payment_status !== 'paid' ? `<button class="btn btn-dark btn-mini" data-action="payment-options" data-id="${escapeHTML(order.id)}">Konfirmasi bayar</button>` : '';
  return `<article class="staff-order"><div><div class="order-top"><div><h3>${escapeHTML(order.student_name)} <span style="font-weight:500;color:#8796a1">· ${escapeHTML(order.class_name)}</span></h3><div class="sub">${escapeHTML(order.plate_number)} · ${escapeHTML(order.vehicle_type)} · ${dateText(order.created_at)}</div></div>${statusPill(order.status)}</div>
      <div class="staff-meta"><span class="meta-chip">📍 Lokasi ${escapeHTML(order.parking_location)} · ${escapeHTML(PARKING[order.parking_location] || '')}</span><span class="meta-chip">☎ ${escapeHTML(order.phone)}</span><span class="meta-chip">${paymentName(order.payment_method)} · ${escapeHTML(order.payment_timing === 'key_pickup' ? 'Bayar saat ambil kunci' : 'Bayar saat ambil motor')}</span><span class="meta-chip">${order.payment_status === 'paid' ? '✓ Lunas' : 'Belum dibayar'}</span><span class="meta-chip">${escapeHTML(rupiah(order.amount_due))}</span></div>
      ${order.notes ? `<div class="help" style="margin-top:8px">Catatan: ${escapeHTML(order.notes)}</div>` : ''}
    </div><div class="staff-controls">${paymentButton}${progressButton}${order.status === 'pending' ? `<button class="btn btn-outline btn-mini" data-action="cancel-order" data-id="${escapeHTML(order.id)}">Batalkan</button>` : ''}</div></article>`;
}
function nextStatus(order) {
  const flow = {
    pending: { status: 'key_collected', label: 'Konfirmasi kunci diambil' },
    key_collected: { status: 'washing', label: 'Mulai proses steam' },
    washing: { status: 'ready', label: 'Tandai selesai dicuci' },
    ready: { status: 'completed', label: 'Serahkan motor' }
  };
  if (order.status === 'completed' || order.status === 'cancelled') return null;
  const item = flow[order.status];
  return item ? { ...item, order } : null;
}

function settingsHome() {
  const price = state.settings.service_price;
  const qris = state.settings.qris_image_url || '';
  return `${hero('Pengaturan layanan', 'Atur tarif steam dan tautan gambar QRIS resmi sekolah. Perubahan berlaku untuk pesanan baru.', '⚙️')}
    <section class="panel"><div class="panel-head"><div><h2>Informasi pembayaran</h2><p>Hanya administrator yang dapat mengubah pengaturan ini.</p></div><span class="status-pill status-ready">Admin</span></div>
      <div class="panel-body"><form id="settings-form"><div class="settings-grid"><div>
          <div class="field"><label>Tarif steam (Rupiah)</label><input name="service_price" type="number" min="0" step="1000" placeholder="Contoh: 15000" value="${price == null ? '' : escapeHTML(price)}"><div class="help">Kosongkan jika tarif belum ditentukan. Tarif yang tersimpan akan otomatis dicatat pada pesanan baru.</div></div>
          <div class="field" style="margin-top:16px"><label>URL gambar QRIS resmi</label><input name="qris_image_url" type="url" placeholder="https://.../qris.png" value="${escapeHTML(qris)}"><div class="help">Unggah gambar QRIS ke penyimpanan publik Supabase, lalu tempel URL-nya di sini. Jangan gunakan QRIS pribadi tanpa persetujuan sekolah.</div></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div>
        </div><div class="setting-preview"><b style="color:var(--ink)">Pratinjau QRIS</b>${qris ? `<img class="qris-preview" src="${escapeHTML(qris)}" alt="QRIS pembayaran" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div style="display:none">Gambar QRIS tidak dapat dimuat. Periksa URL.</div>` : `<div class="empty" style="padding:28px 10px"><div class="empty-icon">▦</div><strong>QRIS belum diatur</strong><p>Tambahkan URL QRIS resmi agar petugas dapat menampilkannya saat siswa akan membayar.</p></div>`}<div>Tarif aktif saat ini: <b style="color:var(--ink)">${escapeHTML(rupiah(price))}</b></div></div></div></form></div>
    </section>`;
}

function render() {
  if (!state.user || !state.profile) { authView(); return; }
  if (isStaff() && state.activeTab === 'settings' && !isAdmin()) state.activeTab = 'orders';
  const content = isStaff() ? (state.activeTab === 'settings' ? settingsHome() : staffHome()) : studentHome();
  appShell(content);
  if (state.currentModal) renderModal();
}

function renderModal() {
  const modal = state.currentModal;
  const order = state.orders.find(o => String(o.id) === String(modal.id));
  if (!order) { state.currentModal = null; return; }
  const hasQris = Boolean(state.settings.qris_image_url);
  root.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>Konfirmasi pembayaran</h3><button class="modal-close" data-action="close-modal" aria-label="Tutup">×</button></div>
    <div class="modal-body"><div class="eyebrow" style="color:var(--teal-dark)">PESANAN ${escapeHTML(String(order.id).slice(0,8).toUpperCase())}</div><h2 style="font:800 20px Manrope;margin:8px 0 4px">${paymentName(order.payment_method)}</h2><p>Nama: <b>${escapeHTML(order.student_name)}</b><br>Plat: <b>${escapeHTML(order.plate_number)}</b><br>Tagihan: <b style="color:var(--navy)">${escapeHTML(rupiah(order.amount_due))}</b></p>
      ${order.payment_method === 'qris' ? (hasQris ? `<img src="${escapeHTML(state.settings.qris_image_url)}" alt="QRIS resmi sekolah"><p>Persilakan siswa memindai QRIS ini. Setelah pembayaran berhasil diterima, petugas menekan tombol konfirmasi.</p>` : `<div class="info-strip" style="text-align:left"><span>ⓘ</span><span>QRIS belum dimasukkan oleh admin. Tampilkan QRIS resmi sekolah secara langsung kepada siswa. Jangan konfirmasi sebelum pembayaran diterima.</span></div>`) : `<div class="info-strip" style="text-align:left"><span>ⓘ</span><span>Terima pembayaran tunai dari siswa. Konfirmasi hanya setelah uang diterima.</span></div>`}
      <p style="font-size:10px">Waktu pembayaran yang dipilih: <b>${escapeHTML(timingName(order.payment_timing))}</b></p>
    </div><div class="modal-actions"><button class="btn btn-light" data-action="close-modal">Batal</button><button class="btn btn-primary" data-action="mark-paid" data-id="${escapeHTML(order.id)}">Pembayaran diterima</button></div>
  </section></div>`);
}

async function init() {
  if (SUPABASE_READY) {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await activateSession(session);
      else render();
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) activateSession(session).catch(err => toast(err.message || 'Gagal memuat akun.'));
        else { clearSession(); render(); }
      });
    } catch (err) {
      console.error(err);
      state.authNotice = { type: 'error', text: 'Tidak bisa terhubung ke Supabase. Periksa koneksi internet dan konfigurasi config.js.' };
      render();
    }
  } else {
    loadDemo();
    render();
  }
}

async function activateSession(session) {
  state.user = session.user;
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!profile) {
    state.profile = null;
    state.authNotice = { type: 'error', text: 'Profil akun belum terbentuk. Pastikan supabase-schema.sql sudah dijalankan.' };
    render();
    return;
  }
  state.profile = profile;
  state.activeTab = 'orders';
  state.authNotice = null;
  await Promise.all([loadSettings(), loadOrders()]);
  subscribeRealtime();
  render();
}
function clearSession() {
  state.user = null; state.profile = null; state.orders = []; state.activeTab = 'orders'; state.currentModal = null;
  if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
}
async function loadSettings() {
  if (state.demo) return;
  const { data, error } = await supabase.from('app_settings').select('service_price,qris_image_url').eq('id', true).maybeSingle();
  if (!error && data) state.settings = data;
}
async function loadOrders() {
  if (state.demo) { state.orders = getDemoOrders().filter(o => isStaff() || o.user_id === state.user.id); return; }
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) { toast('Gagal memuat pesanan: ' + error.message); return; }
  state.orders = data || [];
}
function subscribeRealtime() {
  if (state.demo || !supabase) return;
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel('steam-orders-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => { await loadOrders(); render(); })
    .subscribe();
}

function loadDemo() {
  const stored = localStorage.getItem('steam_school_orders_v1');
  if (!stored) localStorage.setItem('steam_school_orders_v1', '[]');
  const settings = localStorage.getItem('steam_school_settings_v1');
  if (settings) { try { state.settings = JSON.parse(settings); } catch {} }
}
function getDemoOrders() {
  try { return JSON.parse(localStorage.getItem('steam_school_orders_v1') || '[]'); } catch { return []; }
}
function saveDemoOrders(orders) {
  localStorage.setItem('steam_school_orders_v1', JSON.stringify(orders));
  state.orders = orders.filter(o => isStaff() || o.user_id === state.user.id);
}

async function doLogin(form) {
  const formData = new FormData(form);
  state.loading = true; state.authNotice = null; render();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  state.loading = false;
  if (error) { state.authNotice = { type: 'error', text: error.message }; render(); return; }
  if (data.session) await activateSession(data.session);
}
async function doSignup(form) {
  const d = new FormData(form);
  state.loading = true; state.authNotice = null; render();
  const full_name = String(d.get('full_name') || '').trim();
  const class_name = String(d.get('class_name') || '').trim();
  const phone = String(d.get('phone') || '').trim();
  const email = String(d.get('email') || '').trim();
  const password = String(d.get('password') || '');
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name, class_name, phone } } });
  state.loading = false;
  if (error) { state.authNotice = { type: 'error', text: error.message }; render(); return; }
  if (data.session) await activateSession(data.session);
  else {
    state.authMode = 'login';
    state.authNotice = { type: 'success', text: 'Pendaftaran berhasil. Cek email untuk konfirmasi akun, lalu masuk.' };
    render();
  }
}
async function logout() {
  if (state.demo) { clearSession(); render(); return; }
  const { error } = await supabase.auth.signOut();
  if (error) toast(error.message);
}

async function createOrder(form) {
  const d = new FormData(form);
  const payload = {
    student_name: String(d.get('student_name') || '').trim(),
    class_name: String(d.get('class_name') || '').trim(),
    phone: String(d.get('phone') || '').trim(),
    plate_number: String(d.get('plate_number') || '').trim().toUpperCase(),
    vehicle_type: String(d.get('vehicle_type') || '').trim(),
    parking_location: String(d.get('parking_location') || ''),
    payment_method: String(d.get('payment_method') || 'cash'),
    payment_timing: String(d.get('payment_timing') || 'key_pickup'),
    notes: String(d.get('notes') || '').trim() || null
  };
  if (!payload.student_name || !payload.class_name || !payload.phone || !payload.plate_number || !payload.vehicle_type || !payload.parking_location) {
    toast('Lengkapi semua data wajib sebelum mengirim pesanan.'); return;
  }
  state.loading = true; render();
  if (state.demo) {
    const all = getDemoOrders();
    const item = { ...payload, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), user_id: state.user.id, amount_due: state.settings.service_price ?? null, status: 'pending', payment_status: 'unpaid', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    all.unshift(item); saveDemoOrders(all);
  } else {
    const { error } = await supabase.from('orders').insert({ ...payload, user_id: state.user.id });
    if (error) { state.loading = false; render(); toast('Pesanan gagal dikirim: ' + error.message); return; }
    await loadOrders();
  }
  state.loading = false; render(); toast('Pesanan berhasil dikirim. Petugas akan menindaklanjuti.');
}

async function updateOrder(id, changes) {
  if (state.demo) {
    const all = getDemoOrders();
    const index = all.findIndex(o => String(o.id) === String(id));
    if (index < 0) return;
    all[index] = { ...all[index], ...changes, updated_at: new Date().toISOString() };
    saveDemoOrders(all);
    return;
  }
  const { error } = await supabase.from('orders').update(changes).eq('id', id);
  if (error) throw error;
  await loadOrders();
}
async function advanceOrder(id) {
  const order = state.orders.find(o => String(o.id) === String(id));
  if (!order) return;
  const next = nextStatus(order);
  if (!next) return;
  if (order.payment_timing === 'key_pickup' && order.status === 'key_collected' && order.payment_status !== 'paid') {
    toast('Konfirmasi pembayaran saat pengambilan kunci terlebih dahulu.'); return;
  }
  if (order.payment_timing === 'motor_pickup' && order.status === 'ready' && order.payment_status !== 'paid') {
    toast('Konfirmasi pembayaran sebelum motor diserahkan.'); return;
  }
  try { await updateOrder(id, { status: next.status }); render(); toast('Status pesanan diperbarui.'); }
  catch (err) { toast('Gagal memperbarui status: ' + err.message); }
}
async function markPaid(id) {
  const order = state.orders.find(o => String(o.id) === String(id));
  if (!order) return;
  const eligible = (order.payment_timing === 'key_pickup' && order.status === 'key_collected') || (order.payment_timing === 'motor_pickup' && order.status === 'ready');
  if (!eligible) { toast('Pembayaran dikonfirmasi pada tahap yang dipilih siswa.'); return; }
  try {
    const changes = { payment_status: 'paid', payment_confirmed_by: state.demo ? state.user.id : state.user.id, paid_at: new Date().toISOString() };
    await updateOrder(id, changes);
    state.currentModal = null; render(); toast('Pembayaran berhasil dikonfirmasi.');
  } catch (err) { toast('Gagal mengonfirmasi pembayaran: ' + err.message); }
}
async function cancelOrder(id) {
  const order = state.orders.find(o => String(o.id) === String(id));
  if (!order || order.status !== 'pending') return;
  if (!confirm('Batalkan pesanan ini?')) return;
  try { await updateOrder(id, { status: 'cancelled' }); render(); toast('Pesanan dibatalkan.'); }
  catch (err) { toast('Gagal membatalkan pesanan: ' + err.message); }
}
async function saveSettings(form) {
  const d = new FormData(form);
  const priceText = String(d.get('service_price') || '').trim();
  const price = priceText === '' ? null : Number(priceText);
  const qris = String(d.get('qris_image_url') || '').trim();
  if (price !== null && (!Number.isFinite(price) || price < 0)) { toast('Tarif tidak valid.'); return; }
  state.loading = true;
  try {
    if (state.demo) {
      state.settings = { service_price: price, qris_image_url: qris };
      localStorage.setItem('steam_school_settings_v1', JSON.stringify(state.settings));
    } else {
      const { error } = await supabase.from('app_settings').update({ service_price: price, qris_image_url: qris, updated_at: new Date().toISOString(), updated_by: state.user.id }).eq('id', true);
      if (error) throw error;
      await loadSettings();
    }
    state.loading = false; render(); toast('Pengaturan berhasil disimpan.');
  } catch (err) { state.loading = false; render(); toast('Gagal menyimpan: ' + err.message); }
}

// Event delegation
root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'demo-login') {
    const role = target.dataset.role;
    const demoNames = { student: 'Siswa Demo', staff: 'Petugas Demo', admin: 'Admin Demo' };
    state.user = { id: `demo-${role}`, email: `${role}@demo.local` };
    state.profile = { id: state.user.id, full_name: demoNames[role], class_name: role === 'student' ? 'XI TKR 1' : '', phone: '081234567890', role };
    state.activeTab = role === 'admin' ? 'settings' : 'orders'; state.authNotice = null;
    state.orders = getDemoOrders().filter(o => role !== 'student' || o.user_id === state.user.id);
    render(); return;
  }
  if (action === 'auth-mode') { state.authMode = target.dataset.mode; state.authNotice = null; render(); return; }
  if (action === 'logout') { await logout(); return; }
  if (action === 'tab') { state.activeTab = target.dataset.tab; render(); return; }
  if (action === 'advance-order') { await advanceOrder(target.dataset.id); return; }
  if (action === 'cancel-order') { await cancelOrder(target.dataset.id); return; }
  if (action === 'payment-options') { state.currentModal = { id: target.dataset.id }; render(); return; }
  if (action === 'close-modal') { state.currentModal = null; render(); return; }
  if (action === 'mark-paid') { await markPaid(target.dataset.id); return; }
  if (action === 'modal-backdrop' && event.target === target) { state.currentModal = null; render(); return; }
});
root.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'auth-form') { if (SUPABASE_READY) { state.authMode === 'signup' ? await doSignup(form) : await doLogin(form); } return; }
  if (form.id === 'order-form') { await createOrder(form); return; }
  if (form.id === 'settings-form') { await saveSettings(form); return; }
});
root.addEventListener('input', event => {
  if (event.target.id === 'order-search') {
    const start = event.target.selectionStart;
    state.search = event.target.value;
    const staffPanel = event.target.closest('.panel-body');
    if (staffPanel) {
      const scrollY = window.scrollY;
      const panel = staffPanel;
      const filter = document.getElementById('order-filter')?.value || state.filter;
      state.filter = filter;
      const old = panel.querySelector('.staff-list');
      if (old) {
        const all = [...state.orders].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        const filtered = all.filter(o => (state.filter === 'all' || o.status === state.filter) && [o.student_name,o.class_name,o.plate_number,o.phone].some(x => String(x||'').toLowerCase().includes(state.search.toLowerCase())));
        old.innerHTML = filtered.length ? filtered.map(staffOrderCard).join('') : `<div class="empty"><div class="empty-icon">📭</div><strong>Tidak ada pesanan yang cocok</strong><p>Coba kata kunci lain.</p></div>`;
      }
      event.target.setSelectionRange(start, start); window.scrollTo(0, scrollY);
    }
  }
});
root.addEventListener('change', event => {
  if (event.target.id === 'order-filter') {
    state.filter = event.target.value;
    const panel = event.target.closest('.panel-body');
    const search = document.getElementById('order-search');
    const q = (search?.value || '').toLowerCase();
    const list = panel?.querySelector('.staff-list');
    const filtered = [...state.orders].filter(o => (state.filter === 'all' || o.status === state.filter) && [o.student_name,o.class_name,o.plate_number,o.phone].some(x => String(x||'').toLowerCase().includes(q))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    if (list) list.innerHTML = filtered.length ? filtered.map(staffOrderCard).join('') : `<div class="empty"><div class="empty-icon">📭</div><strong>Tidak ada pesanan yang cocok</strong><p>Coba filter lain.</p></div>`;
  }
});

init();
