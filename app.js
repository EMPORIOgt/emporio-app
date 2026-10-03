/* =====================================================================
   Emporio Equipo — núcleo: sesión, navegación, utilidades, Inicio, Marcar, Perfil, Más
   Las demás pantallas viven en: chat.js, horario.js, mas.js, admin.js
   ===================================================================== */
const C = window.EMPORIO;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const V = {};                                   // registro de pantallas
const S = { me: null, profiles: new Map(), cleanup: null, channel: null, badges: { chat: 0, ann: 0 } };

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: C.TZ });
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const mondayOf = ymd => { const d = new Date(ymd + 'T12:00:00'); const k = (d.getDay() + 6) % 7; return addDays(ymd, -k); };
const fDate = (ymd, opt = { day: 'numeric', month: 'short' }) => ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('es-GT', opt) : '';
const fDay = ymd => fDate(ymd, { weekday: 'long', day: 'numeric', month: 'long' });
const fTime = ts => new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: C.TZ });
const fDT = ts => new Date(ts).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: C.TZ }) + ' · ' + fTime(ts);
const hhmm = t => (t || '').slice(0, 5);
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const nameOf = id => S.profiles.get(id)?.full_name || 'Alguien';
const isManager = () => S.me?.role === 'gerencia';
const isLead = () => ['gerencia', 'supervisor'].includes(S.me?.role);
const ROLE_LABEL = { colaborador: 'Colaborador', supervisor: 'Supervisor', gerencia: 'Gerencia', pantalla: 'Pantalla' };

function avatar(p, cls = '') {
  const url = p?.photo_url;
  return url ? `<img class="avatar ${cls}" src="${esc(url)}" alt="" loading="lazy">`
             : `<div class="avatar ${cls}">${esc(initials(p?.full_name))}</div>`;
}
function errMsg(e) {
  const m = String(e?.message || e || 'Error');
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer eso';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Revisa tu internet';
  if (/duplicate key/i.test(m)) return 'Ese registro ya existe';
  return m;
}
let toastT;
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = kind; clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), 3800);
}
async function run(btn, fn) {          // ejecuta una acción deshabilitando el botón
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { console.error(e); toast(errMsg(e), 'bad'); }
  finally { if (btn) btn.disabled = false; }
}
function modal(inner, onMount) {
  const host = $('#modal-host');
  host.innerHTML = `<div class="modal"><div>${inner}</div></div>`;
  const m = $('.modal', host);
  const close = () => { host.innerHTML = ''; };
  m.addEventListener('click', e => { if (e.target === m) close(); });
  $$('[data-close]', m).forEach(b => b.addEventListener('click', close));
  if (onMount) onMount(m, close);
  return { el: m, close };
}
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const goto = h => { location.hash = h; };
async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('*');
  if (error) throw error;
  S.profiles = new Map(data.map(p => [p.id, p]));
  if (S.me) S.me = S.profiles.get(S.me.id) || S.me;
}
const team = () => [...S.profiles.values()].filter(p => p.active && p.role !== 'pantalla');
function manageable() {                 // personas a las que puedo dar puntos, feedback, horarios…
  if (!S.me) return [];
  if (S.me.role === 'gerencia') return team().filter(p => p.id !== S.me.id);
  if (S.me.role === 'supervisor') return team().filter(p => p.id !== S.me.id && p.area && p.area === S.me.area);
  return [];
}
function getPos(o = {}) {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(new Error('Tu teléfono no permite ubicación'));
    navigator.geolocation.getCurrentPosition(ok, e => no(new Error(
      e.code === 1 ? 'Debes permitir el acceso a tu ubicación para marcar (Ajustes → Safari/Chrome → Ubicación)'
                   : 'No se pudo obtener tu ubicación. Sal a un lugar con mejor señal e intenta de nuevo')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...o });
  });
}
const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3M20 20v1"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.3A8 8 0 1 1 21 12z"/>',
  cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
  more: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  fb: '<path d="M4 5h16v11H9l-5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 5a3.5 3.5 0 0 1 0 7M18 20a7 7 0 0 0-3-5.7"/>'
};
const svg = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[k]}</svg>`;

/* ---------- autenticación ---------- */
function authView(msg = '') {
  S.me = null;
  $('#root').innerHTML = `
  <div class="auth">
    <div class="logo">E</div>
    <h1 style="text-align:center;font-size:24px">Emporio Equipo</h1>
    <p class="muted" style="text-align:center;margin:4px 0 18px">Tu espacio de trabajo en Emporio Fitness</p>
    <div class="tabs" style="justify-content:center">
      <button class="on" data-m="in">Ingresar</button><button data-m="up">Crear cuenta</button>
    </div>
    <form id="af" class="card">
      <div id="nm" class="hidden"><label>Nombre completo</label><input id="a-name" autocomplete="name" placeholder="Nombre y apellido"></div>
      <label>Correo electrónico</label><input id="a-mail" type="email" autocomplete="username" required placeholder="tu@correo.com">
      <div id="ph" class="hidden"><label>Teléfono (para encontrarte en el chat)</label><input id="a-phone" type="tel" autocomplete="tel" placeholder="5555 1234"></div>
      <label>Contraseña</label><input id="a-pass" type="password" autocomplete="current-password" required minlength="6" placeholder="Mínimo 6 caracteres">
      <div id="a-msg" class="small ${msg ? '' : 'hidden'}" style="margin:12px 0 0;color:var(--warn)">${esc(msg)}</div>
      <button class="btn" style="margin-top:16px" id="a-go">Entrar</button>
      <p class="small" style="text-align:center;margin:14px 0 0"><a href="#" id="a-forgot">Olvidé mi contraseña</a></p>
    </form>
  </div>`;
  let mode = 'in';
  $$('.tabs button').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#nm').classList.toggle('hidden', mode !== 'up'); $('#ph').classList.toggle('hidden', mode !== 'up');
    $('#a-go').textContent = mode === 'up' ? 'Crear mi cuenta' : 'Entrar';
    $('#a-pass').autocomplete = mode === 'up' ? 'new-password' : 'current-password';
  });
  const say = (t, ok) => { const m = $('#a-msg'); m.textContent = t; m.classList.remove('hidden'); m.style.color = ok ? 'var(--ok)' : 'var(--warn)'; };
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const email = $('#a-mail').value.trim(), password = $('#a-pass').value;
    await run($('#a-go'), async () => {
      if (mode === 'up') {
        const full_name = $('#a-name').value.trim();
        if (full_name.length < 3) return say('Escribe tu nombre completo');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, phone: $('#a-phone').value.trim() } } });
        if (error) return say(/registered/i.test(error.message) ? 'Ese correo ya tiene cuenta. Usa "Ingresar".' : error.message);
        if (!data.session) return say('Cuenta creada. Revisa tu correo y confirma tu cuenta para poder ingresar.', true);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return say(/confirm/i.test(error.message) ? 'Confirma tu correo primero (revisa tu bandeja y spam).' : 'Correo o contraseña incorrectos');
      }
    });
  };
  $('#a-forgot').onclick = async e => {
    e.preventDefault();
    const email = $('#a-mail').value.trim();
    if (!email) return say('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña"');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    say(error ? error.message : 'Te enviamos un correo para crear una nueva contraseña.', !error);
  };
}

function blockedView(title, text) {
  $('#root').innerHTML = `<div class="auth"><div class="logo">E</div><h1 style="text-align:center">${esc(title)}</h1>
  <p class="muted" style="text-align:center">${text}</p><button class="btn sec2" id="b-out" style="margin-top:20px">Cerrar sesión</button></div>`;
  $('#b-out').onclick = () => sb.auth.signOut();
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return authView();
  await enter(session.user);
}
let entering = false;
async function enter(user) {
  if (entering || S.me) return;            // evita cargar dos veces (arranque + evento de sesión)
  entering = true;
  try {
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!me) return blockedView('Cuenta sin perfil', 'No encontramos tu perfil. Pide ayuda a Gerencia.');
    S.me = me;
    if (me.role === 'pantalla') return blockedView('Cuenta de pantalla', 'Esta cuenta es para la PC de Emporio. Ábrela en <b>pantalla.html</b>.');
    if (!me.active) return blockedView('Cuenta desactivada', 'Tu acceso está desactivado. Habla con Gerencia.');
    await loadProfiles();
    buildShell();
    subscribe();
    refreshBadges();
    render();
  } catch (e) { console.error(e); S.me = null; authView('No se pudo cargar tu cuenta: ' + errMsg(e)); }
  finally { entering = false; }
}

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'SIGNED_OUT') { teardown(); authView(); }
  if (ev === 'PASSWORD_RECOVERY') setTimeout(newPasswordModal, 400);
  if (ev === 'SIGNED_IN' && session && !S.me) setTimeout(() => enter(session.user), 0);
});
function newPasswordModal() {
  modal(`<h2>Nueva contraseña</h2><label>Escribe tu nueva contraseña</label><input id="np" type="password" minlength="6" autocomplete="new-password">
  <button class="btn" id="np-go" style="margin-top:14px">Guardar</button>`, (m, close) => {
    $('#np-go', m).onclick = e => run(e.target, async () => {
      const { error } = await sb.auth.updateUser({ password: $('#np', m).value });
      if (error) throw error; toast('Contraseña actualizada', 'ok'); close();
    });
  });
}
function teardown() {
  if (S.cleanup) { try { S.cleanup(); } catch (_) {} S.cleanup = null; }
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  S.profiles = new Map(); S.badges = { chat: 0, ann: 0 };
}

/* ---------- estructura y navegación ---------- */
const NAV = [['inicio', 'Inicio', 'home'], ['marcar', 'Marcar', 'qr'], ['chat', 'Chat', 'chat'], ['horario', 'Horario', 'cal'], ['mas', 'Más', 'more']];
const TITLES = { inicio: 'Inicio', marcar: 'Marcar entrada', chat: 'Chat', horario: 'Horarios', mas: 'Más', solicitudes: 'Solicitudes',
  puntaje: 'Puntaje y metas', capacitaciones: 'Capacitaciones', feedback: 'Feedback', perfil: 'Mi perfil', equipo: 'Gestión del equipo' };

function buildShell() {
  $('#root').innerHTML = `<div id="app">
    <header class="top"><button id="back" class="btn sec2 sm hidden" style="width:38px;padding:7px 0">‹</button>
      <h1 id="ttl">Inicio</h1><a href="#/perfil" id="hav"></a></header>
    <main id="main"></main>
    <nav class="bottom">${NAV.map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${svg(i)}${l}<span class="badge hidden" id="bd-${k}"></span></a>`).join('')}</nav>
  </div>`;
  $('#back').onclick = () => history.back();
  paintHeaderAvatar();
}
function paintHeaderAvatar() { const a = $('#hav'); if (a) a.innerHTML = avatar(S.me, 'sm'); }

function subscribe() {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  S.channel = sb.channel('emporio-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
      window.dispatchEvent(new CustomEvent('newmsg', { detail: p.new })); refreshBadges();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, p => {
      toast('📢 Nuevo comunicado: ' + p.new.title); refreshBadges();
      if (location.hash.startsWith('#/inicio') || location.hash === '' || location.hash === '#/') render();
    })
    .subscribe();
}
async function refreshBadges() {
  try {
    const [{ data: ov }, { data: anns }, { data: reads }] = await Promise.all([
      sb.rpc('chat_overview'),
      sb.from('announcements').select('id'),
      sb.from('announcement_reads').select('announcement_id').eq('user_id', S.me.id)]);
    S.badges.chat = (ov || []).reduce((n, c) => n + Number(c.unread || 0), 0);
    const seen = new Set((reads || []).map(r => r.announcement_id));
    S.badges.ann = (anns || []).filter(a => !seen.has(a.id)).length;
  } catch (_) {}
  const set = (k, n) => { const b = $('#bd-' + k); if (b) { b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n); } };
  set('chat', S.badges.chat); set('inicio', S.badges.ann);
}

async function render() {
  if (!S.me) return;
  if (S.cleanup) { try { S.cleanup(); } catch (_) {} S.cleanup = null; }
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  const view = V[name] ? name : 'inicio';
  const main = $('#main'); if (!main) return;
  const navKey = NAV.some(n => n[0] === view) ? view : 'mas';
  $$('nav.bottom a').forEach(a => a.classList.toggle('on', a.dataset.k === navKey));
  $('#ttl').textContent = TITLES[view] || 'Emporio';
  $('#back').classList.toggle('hidden', NAV.some(n => n[0] === view) && !args.length);
  main.innerHTML = '<p class="empty">Cargando…</p>';
  window.scrollTo(0, 0);
  try { await V[view](main, ...args); }
  catch (e) { console.error(e); main.innerHTML = `<div class="empty">No se pudo cargar.<br><span class="small">${esc(errMsg(e))}</span></div>`; }
}
window.addEventListener('hashchange', render);

/* ---------- INICIO ---------- */
V.inicio = async el => {
  const today = todayStr(), me = S.me;
  const [att, sch, anns, reads, mine, lb, toReview] = await Promise.all([
    sb.from('attendance').select('*').eq('user_id', me.id).eq('work_date', today).maybeSingle(),
    sb.from('schedules').select('*').eq('user_id', me.id).eq('work_date', today).maybeSingle(),
    sb.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(15),
    sb.from('announcement_reads').select('announcement_id').eq('user_id', me.id),
    sb.from('requests').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('status', 'pendiente'),
    sb.rpc('leaderboard'),
    isLead() ? sb.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pendiente').neq('user_id', me.id) : { count: 0 }]);
  const seen = new Set((reads.data || []).map(r => r.announcement_id));
  const rows = lb.data || [];
  const rank = rows.findIndex(r => r.user_id === me.id) + 1;
  const mypts = rows.find(r => r.user_id === me.id);
  const s = sch.data, a = att.data;
  const shift = !s ? '<span class="muted">Sin horario asignado hoy</span>'
    : s.day_off ? '<span class="pill info">Hoy es tu día de descanso</span>'
    : `<b>${hhmm(s.start_time)} – ${hhmm(s.end_time)}</b>${s.break_start ? ` <span class="muted small">· descanso ${hhmm(s.break_start)}–${hhmm(s.break_end)}</span>` : ''}`;
  const first = (me.full_name || '').split(' ')[0];

  el.innerHTML = `
    <div class="title">Hola${first ? ', ' + esc(first) : ''} 👋</div>
    <div class="card">
      <div class="row sb"><div><div class="tiny muted">HOY · ${esc(fDay(today))}</div><div style="margin-top:6px">${shift}</div></div>
        ${a ? `<span class="pill ${a.status === 'tarde' ? 'warn' : 'ok'}">${a.status === 'tarde' ? 'Entrada tarde' : 'Entrada marcada'} ${fTime(a.checked_at)}</span>`
            : (s && s.day_off ? '' : '<a href="#/marcar" class="btn sm" style="text-decoration:none;text-align:center">Marcar</a>')}</div>
    </div>
    <div class="grid2">
      <a class="card" href="#/puntaje" style="text-decoration:none;color:inherit"><div class="tiny muted">PUNTOS DEL MES</div><div class="stat gold">${mypts ? mypts.month_points : 0}</div>
        <div class="tiny muted">${rank ? 'Lugar #' + rank + ' de ' + rows.length : ''}</div></a>
      <a class="card" href="#/solicitudes" style="text-decoration:none;color:inherit"><div class="tiny muted">${isLead() ? 'POR REVISAR' : 'SOLICITUDES'}</div>
        <div class="stat">${isLead() ? (toReview.count || 0) : (mine.count || 0)}</div><div class="tiny muted">${isLead() ? 'pendientes del equipo' : 'pendientes'}</div></a>
    </div>
    <div class="sec">Comunicados</div>
    <div id="anns">${(anns.data || []).length ? '' : '<div class="empty">Aún no hay comunicados</div>'}</div>`;

  const box = $('#anns', el);
  (anns.data || []).forEach(n => {
    const unread = !seen.has(n.id);
    const d = document.createElement('div'); d.className = 'card'; d.style.cursor = 'pointer';
    d.innerHTML = `<div class="row">${unread ? '<span class="dot"></span>' : ''}<div class="grow"><b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b></div>
      ${n.priority !== 'normal' ? `<span class="pill ${n.priority === 'urgente' ? 'bad' : 'warn'}">${esc(n.priority)}</span>` : ''}</div>
      <div class="tiny muted" style="margin:4px 0 6px">${esc(nameOf(n.author_id))} · ${esc(fDT(n.created_at))}${n.target_area ? ' · ' + esc(n.target_area) : ''}</div>
      <div class="small body" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap">${esc(n.body)}</div>`;
    d.onclick = async () => {
      const b = $('.body', d); const open = b.style.webkitLineClamp === 'unset';
      b.style.webkitLineClamp = open ? '2' : 'unset'; b.style.display = open ? '-webkit-box' : 'block';
      if (!open && unread && !d.dataset.read) {
        d.dataset.read = 1; $('.dot', d)?.remove();
        await sb.from('announcement_reads').insert({ announcement_id: n.id, user_id: S.me.id }); refreshBadges();
      }
    };
    box.appendChild(d);
  });
};

/* ---------- MARCAR ENTRADA (QR + GPS) ---------- */
V.marcar = async el => {
  const today = todayStr();
  const { data: hist, error } = await sb.from('attendance').select('*').eq('user_id', S.me.id)
    .order('work_date', { ascending: false }).limit(14);
  if (error) throw error;
  const todayRow = (hist || []).find(r => r.work_date === today);
  const ST = { a_tiempo: ['A tiempo', 'ok'], tarde: ['Tarde', 'warn'], sin_horario: ['Sin horario', ''] };

  el.innerHTML = `<div id="mk"></div>
    <div class="sec">Mis últimas marcas</div>
    <div class="card list">${(hist || []).length ? hist.map(r => `<div class="item"><div class="grow"><b>${esc(fDate(r.work_date, { weekday: 'short', day: 'numeric', month: 'short' }))}</b>
      <div class="tiny muted">Entrada ${fTime(r.checked_at)}</div></div><span class="pill ${ST[r.status][1]}">${ST[r.status][0]}</span></div>`).join('')
      : '<div class="empty">Todavía no has marcado</div>'}</div>`;
  const mk = $('#mk', el);

  const done = row => mk.innerHTML = `<div class="card bigstatus"><div class="ic">${row.status === 'tarde' ? '⏰' : '✅'}</div>
    <h2 style="margin-top:10px">Entrada registrada</h2><div class="gold" style="font-size:30px;font-weight:800;margin:6px 0">${fTime(row.checked_at)}</div>
    <span class="pill ${ST[row.status][1]}">${ST[row.status][0]}</span><p class="muted small">¡Que tengas un excelente turno!</p></div>`;
  if (todayRow) return done(todayRow);

  const idle = (msg = '') => {
    mk.innerHTML = `<div class="card bigstatus"><div class="ic">📷</div><h2 style="margin:10px 0 6px">Marca tu entrada</h2>
      <p class="muted small" style="margin:0 0 16px">Escanea el código QR de la pantalla de Emporio. Debes estar en el gimnasio y permitir tu ubicación.</p>
      ${msg ? `<p class="small" style="color:var(--bad)">${esc(msg)}</p>` : ''}
      <button class="btn" id="scan-go">Escanear código QR</button></div>`;
    $('#scan-go', mk).onclick = e => run(e.target, scan);
  };

  async function scan() {
    if (!navigator.mediaDevices?.getUserMedia) return idle('Tu navegador no permite usar la cámara. Abre la app desde Safari/Chrome.');
    try { await getPos(); } catch (e) { return idle(e.message); }          // pide permiso de ubicación primero
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (_) { return idle('Debes permitir el acceso a la cámara para escanear el código.'); }
    mk.innerHTML = `<div class="scan"><video playsinline muted></video><div class="frame"></div></div>
      <p class="muted small" style="text-align:center" id="sc-msg">Apunta al código QR de la pantalla…</p>
      <button class="btn sec2" id="sc-cancel">Cancelar</button>`;
    const video = $('video', mk), cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    video.srcObject = stream; await video.play();
    let alive = true, busy = false;
    const stop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); };
    S.cleanup = stop;
    $('#sc-cancel', mk).onclick = () => { stop(); idle(); };
    const loop = async () => {
      if (!alive) return;
      if (!busy && video.videoWidth) {
        cv.width = video.videoWidth; cv.height = video.videoHeight; ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data.startsWith('EMPORIO|')) {
          busy = true; $('#sc-msg', mk).textContent = 'Verificando…';
          try {
            const pos = await getPos({ maximumAge: 8000 });
            const { data, error } = await sb.rpc('check_in', { p_token: code.data.slice(8), p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy });
            if (error) throw error;
            stop();
            const row = { status: data.status, checked_at: data.checked_at };
            done(row); toast(data.already ? 'Ya habías marcado hoy' : '¡Entrada registrada!', 'ok'); refreshBadges();
            return;
          } catch (e) { stop(); return idle(errMsg(e)); }
        }
      }
      setTimeout(loop, 160);
    };
    loop();
  }
  idle();
};

/* ---------- PERFIL ---------- */
V.perfil = async el => {
  const me = S.me;
  el.innerHTML = `
    <div class="card" style="text-align:center"><div id="pf-av" style="display:flex;justify-content:center">${avatar(me, 'lg')}</div>
      <label for="pf-file" class="btn sec2 sm" style="display:inline-block;margin-top:12px;cursor:pointer">Cambiar foto</label>
      <input id="pf-file" type="file" accept="image/*" class="hidden">
      <h2 style="margin-top:12px">${esc(me.full_name || 'Sin nombre')}</h2>
      <div class="row" style="justify-content:center;margin-top:6px"><span class="pill gold">${ROLE_LABEL[me.role]}</span>${me.area ? `<span class="pill">${esc(me.area)}</span>` : ''}</div>
      ${me.position ? `<div class="muted small" style="margin-top:6px">${esc(me.position)}</div>` : ''}</div>
    <div class="card"><label style="margin-top:0">Nombre completo</label><input id="pf-name" value="${esc(me.full_name)}">
      <label>Teléfono</label><input id="pf-phone" type="tel" value="${esc(me.phone || '')}" placeholder="5555 1234">
      <label>Correo</label><input value="${esc(me.email || '')}" disabled>
      <button class="btn" id="pf-save" style="margin-top:14px">Guardar cambios</button></div>
    <div class="card"><button class="btn sec2" id="pf-pw">Cambiar contraseña (te enviamos un correo)</button>
      <button class="btn bad" id="pf-out" style="margin-top:10px">Cerrar sesión</button></div>
    <p class="tiny muted" style="text-align:center">Para instalar: en iPhone, Compartir → "Agregar a pantalla de inicio". En Android, menú ⋮ → "Instalar app".</p>`;

  $('#pf-save', el).onclick = e => run(e.target, async () => {
    const full_name = $('#pf-name', el).value.trim();
    if (full_name.length < 3) throw new Error('Escribe tu nombre completo');
    const { error } = await sb.from('profiles').update({ full_name, phone: $('#pf-phone', el).value.trim() || null }).eq('id', me.id);
    if (error) throw new Error(/unique|duplicate/i.test(error.message) ? 'Ese teléfono ya está registrado por otra persona' : error.message);
    await loadProfiles(); toast('Perfil actualizado', 'ok');
  });
  $('#pf-out', el).onclick = () => sb.auth.signOut();
  $('#pf-pw', el).onclick = e => run(e.target, async () => {
    const { error } = await sb.auth.resetPasswordForEmail(me.email, { redirectTo: location.origin + location.pathname });
    if (error) throw error; toast('Revisa tu correo para crear la nueva contraseña', 'ok');
  });
  $('#pf-file', el).onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    await run(null, async () => {
      toast('Subiendo foto…');
      const blob = await squarePhoto(f, 512);
      const path = `${me.id}/avatar.jpg`;
      const up = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (up.error) throw up.error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      const { error } = await sb.from('profiles').update({ photo_url: url }).eq('id', me.id);
      if (error) throw error;
      await loadProfiles(); paintHeaderAvatar(); $('#pf-av', el).innerHTML = avatar(S.me, 'lg'); toast('Foto actualizada', 'ok');
    });
  };
};
function squarePhoto(file, size) {          // recorta al centro y reduce para ahorrar datos
  return new Promise((ok, no) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = size;
      cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(u); cv.toBlob(b => b ? ok(b) : no(new Error('No se pudo procesar la foto')), 'image/jpeg', 0.85);
    };
    img.onerror = () => no(new Error('Esa imagen no se puede leer')); img.src = u;
  });
}

/* ---------- MÁS ---------- */
V.mas = async el => {
  const items = [['solicitudes', 'Solicitudes', 'Permisos y días especiales', 'doc'], ['puntaje', 'Puntaje y metas', 'Tu desempeño y ranking', 'star'],
    ['capacitaciones', 'Capacitaciones', 'Programas aprobados', 'book'], ['feedback', 'Feedback', 'Recibido y seguimiento', 'fb'],
    ['perfil', 'Mi perfil', 'Foto, datos y cuenta', 'user']];
  if (isLead()) items.push(['equipo', 'Gestión del equipo', isManager() ? 'Asistencia, comunicados, usuarios' : 'Asistencia de tu área', 'team']);
  el.innerHTML = `<div class="menu grid2">${items.map(([k, t, d, i]) => `<a href="#/${k}">${svg(i)}<b>${t}</b><span>${d}</span></a>`).join('')}</div>
    <button class="btn bad" id="m-out" style="margin-top:18px">Cerrar sesión</button>`;
  $('#m-out', el).onclick = () => sb.auth.signOut();
};

boot();
