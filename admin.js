/* Emporio Equipo — GESTIÓN DEL EQUIPO (Gerencia y Supervisores): asistencia, comunicados, usuarios, configuración */

V.equipo = async el => {
  if (!isLead()) { el.innerHTML = '<div class="empty">No tienes acceso a esta sección</div>'; return; }
  let tab = 'asistencia', date = todayStr();
  const tabs = [['asistencia', 'Asistencia']];
  if (isManager()) tabs.push(['anuncios', 'Comunicados'], ['usuarios', 'Usuarios'], ['config', 'Configuración']);

  const draw = async () => {
    el.innerHTML = tabsHtml(tabs, tab) + '<div id="eq"></div>';
    $$('.tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const box = $('#eq', el);
    await ({ asistencia: attendanceTab, anuncios: announcementsTab, usuarios: usersTab, config: configTab }[tab])(box, () => date, d => { date = d; }, draw);
  };
  await draw();
};

async function attendanceTab(box, getDate, setDate, redraw) {
  const date = getDate();
  const [att, sch] = await Promise.all([sb.from('attendance').select('*').eq('work_date', date),
    sb.from('schedules').select('*').eq('work_date', date)]);
  if (att.error) throw att.error;
  const people = (isManager() ? team() : manageable()).filter(p => p.role !== 'pantalla').sort((a, b) => a.full_name.localeCompare(b.full_name));
  const A = Object.fromEntries((att.data || []).map(r => [r.user_id, r])), Sc = Object.fromEntries((sch.data || []).map(r => [r.user_id, r]));
  const isToday = date === todayStr();
  const stateOf = p => { const a = A[p.id], s = Sc[p.id];
    if (a) return { k: a.status === 'tarde' ? 'tarde' : 'ok', t: `${a.status === 'tarde' ? 'Tarde' : 'Presente'} · ${fTime(a.checked_at)}` };
    if (s && s.day_off) return { k: 'off', t: 'Descanso' };
    if (s) return { k: 'falta', t: isToday ? 'Aún no marca' : 'No marcó' };
    return { k: 'nosch', t: 'Sin horario' }; };
  const st = people.map(p => ({ p, s: stateOf(p) }));
  const cnt = k => st.filter(x => x.s.k === k).length;
  const PILL = { ok: 'ok', tarde: 'warn', off: 'info', falta: 'bad', nosch: '' };

  box.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="date" id="as-d" value="${date}" max="${todayStr()}" class="grow"></div>
    <div class="grid2" style="margin-bottom:12px"><div class="card" style="margin:0"><div class="tiny muted">PRESENTES</div><div class="stat ok">${cnt('ok') + cnt('tarde')}</div><div class="tiny muted">${cnt('tarde')} tarde</div></div>
      <div class="card" style="margin:0"><div class="tiny muted">${isToday ? 'AÚN SIN MARCAR' : 'AUSENTES'}</div><div class="stat bad">${cnt('falta')}</div><div class="tiny muted">${cnt('off')} en descanso</div></div></div>
    <div class="card list" style="padding:4px 14px">${st.length ? st.map(({ p, s }) => `<div class="item">${avatar(p, 'sm')}<div class="grow"><b>${esc(p.full_name)}</b>
      <div class="tiny muted">${esc(p.area || ROLE_LABEL[p.role])}${Sc[p.id] && !Sc[p.id].day_off ? ' · turno ' + hhmm(Sc[p.id].start_time) : ''}</div></div>
      <div style="text-align:right"><span class="pill ${PILL[s.k]}">${esc(s.t)}</span>${isManager() && !A[p.id] && s.k !== 'off' ? `<div><a href="#" class="tiny" data-man="${p.id}">Registrar manualmente</a></div>` : ''}</div></div>`).join('')
      : '<div class="empty">No hay personas a tu cargo</div>'}</div>`;
  $('#as-d', box).onchange = e => { setDate(e.target.value || todayStr()); redraw(); };
  $$('[data-man]', box).forEach(a => a.onclick = ev => { ev.preventDefault();
    modal(`<h2>Registrar entrada manual</h2><p class="muted small">Para ${esc(nameOf(a.dataset.man))} el ${esc(fDate(date))}. Úsalo solo si no pudo marcar con el QR.</p>
      <label>Hora de entrada</label><input type="time" id="m-t" value="06:00"><label>Motivo</label><input id="m-n" placeholder="Ej. Se le descompuso el teléfono">
      <button class="btn" id="m-go" style="margin-top:14px">Guardar</button>`, (m, close) => { $('#m-go', m).onclick = e => run(e.target, async () => {
      const note = $('#m-n', m).value.trim(); if (note.length < 3) throw new Error('Escribe el motivo');
      const at = new Date(`${date}T${$('#m-t', m).value}:00-06:00`).toISOString();
      const { error } = await sb.from('attendance').insert({ user_id: a.dataset.man, work_date: date, checked_at: at, status: 'sin_horario', note: 'Manual (' + nameOf(S.me.id) + '): ' + note });
      if (error) throw error; close(); toast('Entrada registrada', 'ok'); redraw(); }); }); });
}

async function announcementsTab(box, _g, _s, redraw) {
  const [an, rd] = await Promise.all([sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(30), sb.from('announcement_reads').select('announcement_id')]);
  if (an.error) throw an.error;
  const counts = {}; (rd.data || []).forEach(r => counts[r.announcement_id] = (counts[r.announcement_id] || 0) + 1);
  const total = team().length;
  box.innerHTML = `<button class="btn" id="an-new" style="margin-bottom:14px">＋ Publicar comunicado</button>
    ${(an.data || []).length ? an.data.map(n => `<div class="card"><div class="row sb"><b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b>${n.priority !== 'normal' ? `<span class="pill ${n.priority === 'urgente' ? 'bad' : 'warn'}">${esc(n.priority)}</span>` : ''}</div>
      <div class="small muted" style="margin:6px 0;white-space:pre-wrap">${esc(n.body)}</div><div class="tiny muted">${esc(fDT(n.created_at))} · ${n.target_area ? esc(n.target_area) : 'Todos'} · Leído por ${counts[n.id] || 0} de ${total}</div>
      <button class="btn bad sm" style="margin-top:10px" data-del="${n.id}">Eliminar</button></div>`).join('') : '<div class="empty">No has publicado comunicados</div>'}`;
  $$('[data-del]', box).forEach(b => b.onclick = () => run(b, async () => {
    if (!confirm('¿Eliminar este comunicado para todos?')) return;
    const { error } = await sb.from('announcements').delete().eq('id', b.dataset.del); if (error) throw error; redraw(); }));
  $('#an-new', box).onclick = () => {
    const areas = [...new Set(team().map(p => p.area).filter(Boolean))].sort();
    modal(`<h2>Nuevo comunicado</h2><label>Título</label><input id="n-t" maxlength="200"><label>Mensaje</label><textarea id="n-b" style="min-height:140px"></textarea>
      <div class="grid2"><div><label>Prioridad</label><select id="n-p">${opts([['normal', 'Normal'], ['importante', 'Importante'], ['urgente', 'Urgente']])}</select></div>
      <div><label>Para</label><select id="n-a">${opts([['', 'Todo el equipo'], ...areas.map(a => [a, 'Solo ' + a])])}</select></div></div>
      <label class="chk"><input type="checkbox" id="n-pin"> Fijar arriba</label><button class="btn" id="n-go" style="margin-top:6px">Publicar</button>`, (m, close) => {
      $('#n-go', m).onclick = e => run(e.target, async () => {
        const rec = { title: $('#n-t', m).value.trim(), body: $('#n-b', m).value.trim(), priority: $('#n-p', m).value, target_area: $('#n-a', m).value || null, pinned: $('#n-pin', m).checked, author_id: S.me.id };
        if (rec.title.length < 2 || rec.body.length < 2) throw new Error('Escribe título y mensaje');
        const { error } = await sb.from('announcements').insert(rec); if (error) throw error; close(); toast('Comunicado publicado', 'ok'); redraw(); });
    });
  };
}

async function usersTab(box, _g, _s, redraw) {
  await loadProfiles();
  const all = [...S.profiles.values()].sort((a, b) => (b.active - a.active) || a.full_name.localeCompare(b.full_name));
  box.innerHTML = `<p class="small muted">Toca a una persona para cambiar su rol, área, puesto o desactivar su acceso. Las cuentas nuevas entran como <b>Colaborador</b>.</p>
    <div class="card list" style="padding:4px 14px">${all.map(p => `<div class="item" data-u="${p.id}" style="cursor:pointer;${p.active ? '' : 'opacity:.5'}">${avatar(p, 'sm')}
      <div class="grow"><b>${esc(p.full_name || p.email)}</b><div class="tiny muted">${esc(p.email || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</div></div>
      <div style="text-align:right"><span class="pill ${p.role === 'gerencia' ? 'gold' : ''}">${ROLE_LABEL[p.role]}</span><div class="tiny muted">${esc(p.area || '')}</div></div></div>`).join('')}</div>`;
  $$('[data-u]', box).forEach(it => it.onclick = () => {
    const p = S.profiles.get(it.dataset.u), self = p.id === S.me.id;
    const areas = [...new Set(all.map(x => x.area).filter(Boolean))];
    modal(`<h2>${esc(p.full_name)}</h2><div class="muted small">${esc(p.email || '')}</div>
      <label>Rol</label><select id="u-r" ${self ? 'disabled' : ''}>${opts(Object.entries(ROLE_LABEL), p.role)}</select>
      ${self ? '<div class="tiny muted">No puedes cambiar tu propio rol.</div>' : ''}
      <label>Área</label><input id="u-a" list="areas" value="${esc(p.area || '')}" placeholder="Ej. Entrenadores, Recepción, Limpieza"><datalist id="areas">${areas.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      <label>Puesto</label><input id="u-p" value="${esc(p.position || '')}"><label>Teléfono</label><input id="u-t" type="tel" value="${esc(p.phone || '')}">
      <label>Fecha de ingreso</label><input id="u-h" type="date" value="${p.hire_date || ''}">
      <label class="chk"><input type="checkbox" id="u-ac" ${p.active ? 'checked' : ''} ${self ? 'disabled' : ''}> Cuenta activa</label>
      <button class="btn" id="u-go">Guardar</button>`, (m, close) => {
      $('#u-go', m).onclick = e => run(e.target, async () => {
        const upd = { area: $('#u-a', m).value.trim() || null, position: $('#u-p', m).value.trim() || null, phone: $('#u-t', m).value.trim() || null, hire_date: $('#u-h', m).value || null };
        if (!self) { upd.role = $('#u-r', m).value; upd.active = $('#u-ac', m).checked; }
        const { error } = await sb.from('profiles').update(upd).eq('id', p.id);
        if (error) throw new Error(/unique|duplicate/i.test(error.message) ? 'Ese teléfono ya lo tiene otra persona' : error.message);
        close(); toast('Usuario actualizado', 'ok'); redraw(); });
    });
  });
}

async function configTab(box, _g, _s, redraw) {
  const { data: s, error } = await sb.from('settings').select('*').eq('id', 1).single();
  if (error) throw error;
  box.innerHTML = `<div class="card"><h3>Ubicación de Emporio</h3>
      <p class="small muted" style="margin-top:0">El marcaje solo funciona dentro de este radio. <b>Haz esto estando dentro del gimnasio.</b></p>
      <div class="grid2"><div><label>Latitud</label><input id="c-lat" type="number" step="any" value="${s.gym_lat ?? ''}"></div><div><label>Longitud</label><input id="c-lng" type="number" step="any" value="${s.gym_lng ?? ''}"></div></div>
      <button class="btn sec2" id="c-gps" style="margin-top:10px">📍 Usar mi ubicación actual</button>
      <div class="grid2"><div><label>Radio permitido (metros)</label><input id="c-rad" type="number" min="20" max="1000" value="${s.radius_m}"></div>
        <div><label>Minutos de gracia (tarde)</label><input id="c-gr" type="number" min="0" max="120" value="${s.late_grace_min}"></div></div></div>
    <div class="card"><h3>Pantalla QR</h3><label style="margin-top:0">Nombre del gimnasio</label><input id="c-name" value="${esc(s.gym_name)}">
      <label>El código cambia cada (segundos)</label><input id="c-win" type="number" min="15" max="300" value="${s.qr_window_seconds}"></div>
    <button class="btn" id="c-save">Guardar configuración</button>
    <div class="card" style="margin-top:14px"><h3>Cómo conectar la PC de Emporio</h3><p class="small muted" style="margin:0">1) En esa PC crea una cuenta nueva con un correo propio (ej. pantalla@…) desde la pantalla de registro.<br>
      2) Aquí en <b>Usuarios</b>, cámbiale el rol a <b>Pantalla</b>.<br>3) En la PC abre <b>pantalla.html</b> (misma dirección de la app) e inicia sesión con esa cuenta. Déjala en pantalla completa (F11).</p></div>`;
  $('#c-gps', box).onclick = e => run(e.target, async () => {
    const pos = await getPos({ maximumAge: 0 });
    $('#c-lat', box).value = pos.coords.latitude.toFixed(6); $('#c-lng', box).value = pos.coords.longitude.toFixed(6);
    toast(`Ubicación tomada (precisión ≈ ${Math.round(pos.coords.accuracy)} m). Recuerda guardar.`, 'ok');
  });
  $('#c-save', box).onclick = e => run(e.target, async () => {
    const lat = parseFloat($('#c-lat', box).value), lng = parseFloat($('#c-lng', box).value);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Configura la ubicación del gimnasio (latitud y longitud)');
    const upd = { gym_lat: lat, gym_lng: lng, radius_m: parseInt($('#c-rad', box).value, 10), late_grace_min: parseInt($('#c-gr', box).value, 10),
      gym_name: $('#c-name', box).value.trim() || 'Emporio Fitness', qr_window_seconds: parseInt($('#c-win', box).value, 10) };
    const { error } = await sb.from('settings').update(upd).eq('id', 1); if (error) throw error; toast('Configuración guardada', 'ok');
  });
}
