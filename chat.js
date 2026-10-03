/* Emporio Equipo — CHAT interno (tipo WhatsApp: directos y grupos, en tiempo real) */

V.chat = async (el, convId) => (convId ? conversation(el, convId) : chatList(el));

async function chatList(el) {
  const { data, error } = await sb.rpc('chat_overview');
  if (error) throw error;
  const title = c => c.kind === 'group' ? (c.name || 'Grupo') : nameOf(c.other_user);
  el.innerHTML = `
    <div class="row" style="margin-bottom:12px"><button class="btn sm grow" id="c-new">＋ Nuevo chat</button>
      ${isLead() ? '<button class="btn sec2 sm grow" id="c-grp">＋ Nuevo grupo</button>' : ''}</div>
    <div class="card list" style="padding:4px 14px">${(data || []).length ? data.map(c => `
      <a class="item" href="#/chat/${c.conversation_id}" style="text-decoration:none;color:inherit">
        ${c.kind === 'group' ? '<div class="avatar">👥</div>' : avatar(S.profiles.get(c.other_user))}
        <div class="grow"><div class="row sb"><b>${esc(title(c))}</b><span class="tiny muted">${c.last_body ? esc(fTime(c.last_at)) : ''}</span></div>
          <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || 'Sin mensajes todavía')}</div></div>
        ${Number(c.unread) ? `<span class="badge" style="position:static">${c.unread}</span>` : ''}</a>`).join('')
      : '<div class="empty">No tienes conversaciones</div>'}</div>`;

  $('#c-new', el).onclick = () => pickContact();
  const g = $('#c-grp', el); if (g) g.onclick = newGroup;
}

function pickContact() {
  const people = team().filter(p => p.id !== S.me.id).sort((a, b) => a.full_name.localeCompare(b.full_name));
  modal(`<h2>Nuevo chat</h2><input id="q" placeholder="Buscar por nombre o teléfono" autocomplete="off">
    <div class="list" id="ppl" style="margin-top:8px"></div>`, (m, close) => {
    const paint = () => {
      const q = $('#q', m).value.trim().toLowerCase().replace(/\s+/g, '');
      const rows = people.filter(p => !q || p.full_name.toLowerCase().includes(q) || (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
      $('#ppl', m).innerHTML = rows.length ? rows.map(p => `<div class="item" data-id="${p.id}" style="cursor:pointer">${avatar(p)}
        <div class="grow"><b>${esc(p.full_name)}</b><div class="tiny muted">${esc(p.area || ROLE_LABEL[p.role])}${p.phone ? ' · ' + esc(p.phone) : ''}</div></div></div>`).join('')
        : '<div class="empty">Sin resultados</div>';
      $$('.item', m).forEach(it => it.onclick = () => run(null, async () => {
        const { data, error } = await sb.rpc('start_direct_chat', { p_other: it.dataset.id });
        if (error) throw error; close(); goto('#/chat/' + data);
      }));
    };
    $('#q', m).oninput = paint; paint();
  });
}

function newGroup() {
  const people = team().filter(p => p.id !== S.me.id).sort((a, b) => a.full_name.localeCompare(b.full_name));
  modal(`<h2>Nuevo grupo</h2><label>Nombre del grupo</label><input id="gn" placeholder="Ej. Entrenadores turno mañana">
    <label>Integrantes</label><div class="list">${people.map(p => `<label class="item chk" style="margin:0;padding:10px 0;color:var(--text);font-size:15px">
      <input type="checkbox" value="${p.id}">${avatar(p, 'sm')}<span class="grow">${esc(p.full_name)} <span class="tiny muted">${esc(p.area || '')}</span></span></label>`).join('')}</div>
    <button class="btn" id="gc" style="margin-top:14px">Crear grupo</button>`, (m, close) => {
    $('#gc', m).onclick = e => run(e.target, async () => {
      const ids = $$('input:checked', m).map(i => i.value);
      if (!ids.length) throw new Error('Elige al menos una persona');
      const { data, error } = await sb.rpc('create_group', { p_name: $('#gn', m).value, p_members: ids });
      if (error) throw error; close(); goto('#/chat/' + data);
    });
  });
}

async function conversation(el, id) {
  const { data: ov } = await sb.rpc('chat_overview');
  const c = (ov || []).find(x => x.conversation_id === id);
  if (!c) { el.innerHTML = '<div class="empty">Conversación no disponible</div>'; return; }
  $('#ttl').textContent = c.kind === 'group' ? (c.name || 'Grupo') : nameOf(c.other_user);

  const { data: rows, error } = await sb.from('messages').select('*').eq('conversation_id', id)
    .order('created_at', { ascending: false }).limit(150);
  if (error) throw error;
  const seen = new Set();
  el.innerHTML = `<div class="chat-wrap"><div class="msgs" id="msgs"></div>
    <div class="composer"><textarea id="cm" rows="1" placeholder="Escribe un mensaje"></textarea><button id="cs" aria-label="Enviar">➤</button></div></div>`;
  const box = $('#msgs', el);
  let lastDay = '';
  const add = m => {
    if (seen.has(m.id)) return; seen.add(m.id);
    const day = new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: C.TZ });
    if (day !== lastDay) { lastDay = day; box.insertAdjacentHTML('beforeend', `<div class="tiny muted" style="text-align:center;margin:8px 0">${esc(fDate(day, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`); }
    const mine = m.sender_id === S.me.id;
    box.insertAdjacentHTML('beforeend', `<div class="msg ${mine ? 'me' : ''}">${!mine && c.kind === 'group' ? `<div class="who">${esc(nameOf(m.sender_id))}</div>` : ''}${esc(m.body)}<div class="t">${fTime(m.created_at)}</div></div>`);
    box.scrollTop = box.scrollHeight;
  };
  const markRead = () => sb.from('conversation_members').update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', id).eq('user_id', S.me.id).then(refreshBadges);
  (rows || []).slice().reverse().forEach(add); markRead();

  const onNew = e => { const m = e.detail; if (m.conversation_id === id) { add(m); markRead(); } };
  window.addEventListener('newmsg', onNew);
  S.cleanup = () => window.removeEventListener('newmsg', onNew);

  const ta = $('#cm', el), send = $('#cs', el);
  const go = () => run(send, async () => {
    const body = ta.value.trim(); if (!body) return;
    ta.value = ''; ta.style.height = 'auto';
    const { data, error } = await sb.from('messages').insert({ conversation_id: id, body }).select().single();
    if (error) { ta.value = body; throw error; }
    add(data);
  });
  send.onclick = go;
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); go(); } });
}
