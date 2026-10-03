/* Emporio Equipo — SOLICITUDES, PUNTAJE Y METAS, CAPACITACIONES, FEEDBACK */

const REQ_TYPES = [['permiso', 'Permiso'], ['dia_especial', 'Día especial'], ['vacaciones', 'Vacaciones'], ['cambio_turno', 'Cambio de turno'], ['otro', 'Otro']];
const reqLabel = t => (REQ_TYPES.find(x => x[0] === t) || [, t])[1];
const REQ_ST = { pendiente: ['Pendiente', 'warn'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'bad'] };
const rangeTxt = (a, b) => a === b ? fDate(a) : `${fDate(a)} → ${fDate(b)}`;
const tabsHtml = (list, cur) => `<div class="tabs">${list.map(([k, l]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;

/* ---------------- SOLICITUDES ---------------- */
V.solicitudes = async el => {
  let tab = 'mias';
  const draw = async () => {
    const tabs = [['mias', 'Mis solicitudes']]; if (isLead()) tabs.push(['revisar', 'Por revisar']);
    const { data, error } = await sb.from('requests').select('*').order('created_at', { ascending: false }).limit(80);
    if (error) throw error;
    const mine = data.filter(r => r.user_id === S.me.id), others = data.filter(r => r.user_id !== S.me.id);
    const card = (r, review) => `<div class="card"><div class="row sb"><b>${esc(reqLabel(r.type))}</b><span class="pill ${REQ_ST[r.status][1]}">${REQ_ST[r.status][0]}</span></div>
      ${review ? `<div class="row" style="margin:8px 0">${avatar(S.profiles.get(r.user_id), 'sm')}<b>${esc(nameOf(r.user_id))}</b></div>` : ''}
      <div class="small" style="margin-top:6px">📅 ${esc(rangeTxt(r.start_date, r.end_date))}</div>
      <div class="small muted" style="margin:6px 0;white-space:pre-wrap">${esc(r.reason)}</div>
      ${r.review_note ? `<div class="small" style="border-left:3px solid var(--gold);padding-left:8px;margin:8px 0">${esc(nameOf(r.reviewed_by))}: ${esc(r.review_note)}</div>` : ''}
      <div class="tiny muted">Enviada ${esc(fDT(r.created_at))}</div>
      ${review && r.status === 'pendiente' ? `<div class="row" style="margin-top:10px"><button class="btn ok sm grow" data-rv="aprobada" data-id="${r.id}">Aprobar</button><button class="btn bad sm grow" data-rv="rechazada" data-id="${r.id}">Rechazar</button></div>` : ''}
      ${!review && r.status === 'pendiente' ? `<button class="btn sec2 sm" style="margin-top:10px" data-cancel="${r.id}">Cancelar solicitud</button>` : ''}</div>`;
    const pend = others.filter(r => r.status === 'pendiente'), rest = others.filter(r => r.status !== 'pendiente');
    el.innerHTML = tabsHtml(tabs, tab) + (tab === 'mias'
      ? `<button class="btn" id="r-new" style="margin-bottom:14px">＋ Nueva solicitud</button>${mine.length ? mine.map(r => card(r)).join('') : '<div class="empty">No has hecho solicitudes</div>'}`
      : `${pend.length ? pend.map(r => card(r, true)).join('') : '<div class="empty">No hay solicitudes pendientes 🎉</div>'}
         ${rest.length ? `<div class="sec">Resueltas recientemente</div>${rest.slice(0, 15).map(r => card(r, true)).join('')}` : ''}`);
    $$('.tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const nb = $('#r-new', el); if (nb) nb.onclick = () => newRequest(draw);
    $$('[data-cancel]', el).forEach(b => b.onclick = () => run(b, async () => {
      const { error } = await sb.from('requests').delete().eq('id', b.dataset.cancel); if (error) throw error; toast('Solicitud cancelada'); draw();
    }));
    $$('[data-rv]', el).forEach(b => b.onclick = () => reviewRequest(b.dataset.id, b.dataset.rv, draw));
  };
  await draw();
};
function newRequest(done) {
  const t = todayStr();
  modal(`<h2>Nueva solicitud</h2><label>Tipo</label><select id="q-t">${opts(REQ_TYPES)}</select>
    <div class="grid2"><div><label>Desde</label><input type="date" id="q-a" value="${t}" min="${t}"></div><div><label>Hasta</label><input type="date" id="q-b" value="${t}" min="${t}"></div></div>
    <label>Motivo</label><textarea id="q-r" placeholder="Cuéntanos brevemente el motivo"></textarea>
    <button class="btn" id="q-go" style="margin-top:14px">Enviar solicitud</button>`, (m, close) => {
    $('#q-a', m).onchange = e => { if ($('#q-b', m).value < e.target.value) $('#q-b', m).value = e.target.value; $('#q-b', m).min = e.target.value; };
    $('#q-go', m).onclick = e => run(e.target, async () => {
      const rec = { type: $('#q-t', m).value, start_date: $('#q-a', m).value, end_date: $('#q-b', m).value, reason: $('#q-r', m).value.trim() };
      if (rec.reason.length < 3) throw new Error('Escribe el motivo');
      if (!rec.start_date || !rec.end_date || rec.end_date < rec.start_date) throw new Error('Revisa las fechas');
      const { error } = await sb.from('requests').insert(rec); if (error) throw error;
      close(); toast('Solicitud enviada', 'ok'); done();
    });
  });
}
function reviewRequest(id, status, done) {
  const ok = status === 'aprobada';
  modal(`<h2>${ok ? 'Aprobar' : 'Rechazar'} solicitud</h2><label>Comentario para el colaborador ${ok ? '(opcional)' : ''}</label><textarea id="rv-n"></textarea>
    <button class="btn ${ok ? 'ok' : 'bad'}" id="rv-go" style="margin-top:14px">${ok ? 'Aprobar' : 'Rechazar'}</button>`, (m, close) => {
    $('#rv-go', m).onclick = e => run(e.target, async () => {
      const note = $('#rv-n', m).value.trim();
      if (!ok && !note) throw new Error('Explica brevemente por qué se rechaza');
      const { error } = await sb.from('requests').update({ status, review_note: note || null }).eq('id', id);
      if (error) throw error; close(); toast(ok ? 'Solicitud aprobada' : 'Solicitud rechazada', 'ok'); done();
    });
  });
}

/* ---------------- PUNTAJE Y METAS ---------------- */
const PT_CAT = [['desempeno', 'Desempeño'], ['puntualidad', 'Puntualidad'], ['meta', 'Meta cumplida'], ['servicio', 'Servicio al cliente'], ['capacitacion', 'Capacitación'], ['otro', 'Otro']];
V.puntaje = async el => {
  let tab = 'mio';
  const draw = async () => {
    const tabs = [['mio', 'Mi puntaje'], ['ranking', 'Ranking']]; if (isLead()) tabs.push(['gestion', 'Gestionar']);
    const [lb, pts, goals] = await Promise.all([sb.rpc('leaderboard'),
      sb.from('points').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('goals').select('*').order('created_at', { ascending: false }).limit(100)]);
    if (lb.error) throw lb.error;
    const rows = lb.data || [], me = rows.find(r => r.user_id === S.me.id);
    const myPts = (pts.data || []).filter(p => p.user_id === S.me.id), myGoals = (goals.data || []).filter(g => g.user_id === S.me.id);
    const goalCard = (g, mgr) => { const pc = Math.min(100, Math.round(Number(g.progress) / Number(g.target) * 100));
      return `<div class="card"><div class="row sb"><b>${esc(g.title)}</b>${g.completed_at ? '<span class="pill ok">Cumplida ✓</span>' : g.points_reward ? `<span class="pill gold">+${g.points_reward} pts</span>` : ''}</div>
      ${mgr ? `<div class="small muted">${esc(nameOf(g.user_id))}</div>` : ''}
      ${g.description ? `<div class="small muted" style="margin-top:4px">${esc(g.description)}</div>` : ''}
      <div style="background:var(--card2);border-radius:99px;height:8px;margin:10px 0 4px;overflow:hidden"><div style="width:${pc}%;height:100%;background:var(--gold)"></div></div>
      <div class="row sb tiny muted"><span>${Number(g.progress)} de ${Number(g.target)} (${pc}%)</span><span>${g.due_date ? 'Meta para ' + esc(fDate(g.due_date)) : ''}</span></div>
      ${mgr && !g.completed_at ? `<div class="row" style="margin-top:10px"><button class="btn sec2 sm grow" data-prog="${g.id}">Actualizar avance</button><button class="btn ok sm grow" data-done="${g.id}">Marcar cumplida</button></div>` : ''}</div>`; };

    let body = '';
    if (tab === 'mio') body = `<div class="grid2"><div class="card"><div class="tiny muted">DEL MES</div><div class="stat gold">${me ? me.month_points : 0}</div></div>
        <div class="card"><div class="tiny muted">ACUMULADO</div><div class="stat">${me ? me.total_points : 0}</div></div></div>
      <div class="sec">Mis metas</div>${myGoals.length ? myGoals.map(g => goalCard(g)).join('') : '<div class="empty">Aún no tienes metas asignadas</div>'}
      <div class="sec">Movimientos recientes</div><div class="card list">${myPts.length ? myPts.slice(0, 30).map(p => `<div class="item"><div class="grow"><b>${esc(p.reason)}</b>
        <div class="tiny muted">${esc((PT_CAT.find(c => c[0] === p.category) || [, ''])[1])} · ${esc(fDate(p.created_at.slice(0, 10)))}${p.awarded_by ? ' · ' + esc(nameOf(p.awarded_by)) : ''}</div></div>
        <b class="${p.points > 0 ? 'ok' : 'bad'}">${p.points > 0 ? '+' : ''}${p.points}</b></div>`).join('') : '<div class="empty">Sin movimientos todavía</div>'}</div>`;
    else if (tab === 'ranking') body = `<div class="card list">${rows.length ? rows.map((r, i) => `<div class="item" ${r.user_id === S.me.id ? 'style="background:#2b2415;margin:0 -14px;padding:12px 14px"' : ''}>
        <div style="width:26px;text-align:center;font-weight:800;color:${i < 3 ? 'var(--gold)' : 'var(--muted)'}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div>${avatar(r, 'sm')}
        <div class="grow"><b>${esc(r.full_name)}</b><div class="tiny muted">${esc(r.area || '')}</div></div>
        <div style="text-align:right"><b class="gold">${r.month_points}</b><div class="tiny muted">mes</div></div></div>`).join('') : '<div class="empty">Sin datos</div>'}</div>
      <p class="tiny muted" style="text-align:center">El ranking se reinicia cada mes; el acumulado se conserva.</p>`;
    else body = `<div class="grid2"><button class="btn" id="g-pts">＋ Dar puntos</button><button class="btn sec2" id="g-goal">＋ Nueva meta</button></div>
      <div class="sec">Metas en curso</div>${(goals.data || []).filter(g => !g.completed_at && g.user_id !== S.me.id).map(g => goalCard(g, true)).join('') || '<div class="empty">No hay metas en curso</div>'}
      <div class="sec">Últimos puntos otorgados</div><div class="card list">${(pts.data || []).filter(p => p.user_id !== S.me.id).slice(0, 15).map(p => `<div class="item"><div class="grow"><b>${esc(nameOf(p.user_id))}</b>
        <div class="tiny muted">${esc(p.reason)}</div></div><b class="${p.points > 0 ? 'ok' : 'bad'}">${p.points > 0 ? '+' : ''}${p.points}</b></div>`).join('') || '<div class="empty">Aún no has otorgado puntos</div>'}</div>`;
    el.innerHTML = tabsHtml(tabs, tab) + body;
    $$('.tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const gp = $('#g-pts', el); if (gp) gp.onclick = () => givePoints(draw);
    const gg = $('#g-goal', el); if (gg) gg.onclick = () => newGoal(draw);
    $$('[data-done]', el).forEach(b => b.onclick = () => run(b, async () => {
      const { error } = await sb.rpc('complete_goal', { p_goal: b.dataset.done }); if (error) throw error; toast('Meta cumplida y puntos otorgados', 'ok'); draw();
    }));
    $$('[data-prog]', el).forEach(b => b.onclick = () => { const g = goals.data.find(x => x.id === b.dataset.prog);
      modal(`<h2>Avance de la meta</h2><div class="muted small">${esc(g.title)} (objetivo: ${Number(g.target)})</div><label>Avance actual</label><input id="pg" type="number" min="0" step="any" value="${Number(g.progress)}">
        <button class="btn" id="pg-go" style="margin-top:14px">Guardar</button>`, (m, close) => { $('#pg-go', m).onclick = e => run(e.target, async () => {
        const { error } = await sb.from('goals').update({ progress: Number($('#pg', m).value) }).eq('id', g.id); if (error) throw error; close(); draw(); }); }); });
  };
  await draw();
};
const personSelect = id => `<select id="${id}">${opts([['', 'Selecciona…'], ...manageable().sort((a, b) => a.full_name.localeCompare(b.full_name)).map(p => [p.id, p.full_name + (p.area ? ' · ' + p.area : '')])])}</select>`;
function givePoints(done) {
  modal(`<h2>Dar puntos</h2><label>Colaborador</label>${personSelect('p-u')}
    <div class="grid2"><div><label>Puntos (negativos restan)</label><input id="p-n" type="number" step="1" min="-1000" max="1000" value="10"></div>
    <div><label>Categoría</label><select id="p-c">${opts(PT_CAT)}</select></div></div>
    <label>Motivo</label><textarea id="p-r" placeholder="Ej. Atendió excelente a un cliente nuevo"></textarea>
    <button class="btn" id="p-go" style="margin-top:14px">Guardar</button>`, (m, close) => {
    $('#p-go', m).onclick = e => run(e.target, async () => {
      const rec = { user_id: $('#p-u', m).value, points: parseInt($('#p-n', m).value, 10), category: $('#p-c', m).value, reason: $('#p-r', m).value.trim(), awarded_by: S.me.id };
      if (!rec.user_id) throw new Error('Elige a la persona'); if (!rec.points) throw new Error('Los puntos no pueden ser 0'); if (rec.reason.length < 3) throw new Error('Escribe el motivo');
      const { error } = await sb.from('points').insert(rec); if (error) throw error; close(); toast('Puntos registrados', 'ok'); done();
    });
  });
}
function newGoal(done) {
  modal(`<h2>Nueva meta</h2><label>Colaborador</label>${personSelect('g-u')}<label>Meta</label><input id="g-t" placeholder="Ej. Vender 5 membresías este mes">
    <label>Descripción (opcional)</label><input id="g-d"><div class="grid2"><div><label>Objetivo (número)</label><input id="g-n" type="number" min="1" step="any" value="1"></div>
    <div><label>Puntos al cumplirla</label><input id="g-p" type="number" min="0" max="1000" value="25"></div></div><label>Fecha límite (opcional)</label><input id="g-f" type="date">
    <button class="btn" id="g-go" style="margin-top:14px">Crear meta</button>`, (m, close) => {
    $('#g-go', m).onclick = e => run(e.target, async () => {
      const rec = { user_id: $('#g-u', m).value, title: $('#g-t', m).value.trim(), description: $('#g-d', m).value.trim() || null,
        target: Number($('#g-n', m).value), points_reward: parseInt($('#g-p', m).value || '0', 10), due_date: $('#g-f', m).value || null, created_by: S.me.id };
      if (!rec.user_id) throw new Error('Elige a la persona'); if (rec.title.length < 3) throw new Error('Escribe la meta');
      const { error } = await sb.from('goals').insert(rec); if (error) throw error; close(); toast('Meta creada', 'ok'); done();
    });
  });
}

/* ---------------- CAPACITACIONES ---------------- */
V.capacitaciones = async el => {
  let tab = 'disp';
  const draw = async () => {
    const tabs = [['disp', 'Disponibles'], ['mias', 'Mis capacitaciones']]; if (isManager()) tabs.push(['prop', 'Propuestas']);
    const [tr, en] = await Promise.all([sb.from('trainings').select('*').order('starts_on', { ascending: true, nullsFirst: false }),
      sb.from('training_enrollments').select('*')]);
    if (tr.error) throw tr.error;
    const all = tr.data || [], enr = en.data || [];
    const myEnr = Object.fromEntries(enr.filter(x => x.user_id === S.me.id).map(x => [x.training_id, x]));
    const approved = all.filter(t => t.status === 'aprobada');
    const card = t => { const e = myEnr[t.id];
      return `<div class="card"><div class="row sb"><b>${esc(t.title)}</b><span class="pill ${t.kind === 'interna' ? 'gold' : 'info'}">${t.kind === 'interna' ? 'Interna' : 'Externa'}</span></div>
      ${t.mandatory ? '<span class="pill bad" style="margin-top:6px">Obligatoria</span>' : ''}
      ${t.description ? `<div class="small muted" style="margin:8px 0;white-space:pre-wrap">${esc(t.description)}</div>` : ''}
      <div class="tiny muted">${t.provider ? esc(t.provider) + ' · ' : ''}${t.starts_on ? esc(rangeTxt(t.starts_on, t.ends_on || t.starts_on)) : 'Fecha por definir'}${t.hours ? ' · ' + Number(t.hours) + ' h' : ''}</div>
      ${t.url ? `<div style="margin-top:6px"><a class="small" href="${esc(/^https?:\/\//.test(t.url) ? t.url : '#')}" target="_blank" rel="noopener">Abrir enlace</a></div>` : ''}
      <div class="row" style="margin-top:10px">${e ? (e.status === 'completada' ? '<span class="pill ok">Completada ✓</span>' : `<span class="pill warn">Inscrito</span><button class="btn sec2 sm" data-out="${t.id}">Salirme</button>`)
        : `<button class="btn sm" data-in="${t.id}">Inscribirme</button>`}
        ${isLead() ? `<button class="btn sec2 sm" data-ppl="${t.id}">Participantes</button>` : ''}</div></div>`; };
    let body = '';
    if (tab === 'disp') body = `<button class="btn sec2" id="t-prop" style="margin-bottom:14px">＋ ${isManager() ? 'Crear capacitación' : 'Proponer una capacitación'}</button>${approved.length ? approved.map(card).join('') : '<div class="empty">Aún no hay capacitaciones aprobadas</div>'}`;
    else if (tab === 'mias') { const mine = approved.filter(t => myEnr[t.id]); const myProps = all.filter(t => t.created_by === S.me.id && t.status !== 'aprobada');
      body = `${mine.length ? mine.map(card).join('') : '<div class="empty">No estás inscrito en ninguna</div>'}
        ${myProps.length ? `<div class="sec">Mis propuestas</div>${myProps.map(t => `<div class="card"><div class="row sb"><b>${esc(t.title)}</b><span class="pill ${t.status === 'rechazada' ? 'bad' : 'warn'}">${t.status === 'rechazada' ? 'Rechazada' : 'En revisión'}</span></div></div>`).join('')}` : ''}`; }
    else { const props = all.filter(t => t.status === 'propuesta');
      body = props.length ? props.map(t => `<div class="card"><div class="row sb"><b>${esc(t.title)}</b><span class="pill ${t.kind === 'interna' ? 'gold' : 'info'}">${esc(t.kind)}</span></div>
        <div class="small muted" style="margin:6px 0">Propuesta de ${esc(nameOf(t.created_by))}${t.provider ? ' · ' + esc(t.provider) : ''}</div>${t.description ? `<div class="small">${esc(t.description)}</div>` : ''}
        <div class="row" style="margin-top:10px"><button class="btn ok sm grow" data-ap="aprobada" data-id="${t.id}">Aprobar</button><button class="btn bad sm grow" data-ap="rechazada" data-id="${t.id}">Rechazar</button></div></div>`).join('') : '<div class="empty">No hay propuestas pendientes</div>'; }
    el.innerHTML = tabsHtml(tabs, tab) + body;
    $$('.tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const pb = $('#t-prop', el); if (pb) pb.onclick = () => trainingForm(draw);
    $$('[data-in]', el).forEach(b => b.onclick = () => run(b, async () => { const { error } = await sb.from('training_enrollments').insert({ training_id: b.dataset.in, user_id: S.me.id }); if (error) throw error; toast('Inscripción registrada', 'ok'); draw(); }));
    $$('[data-out]', el).forEach(b => b.onclick = () => run(b, async () => { const { error } = await sb.from('training_enrollments').delete().eq('training_id', b.dataset.out).eq('user_id', S.me.id); if (error) throw error; draw(); }));
    $$('[data-ap]', el).forEach(b => b.onclick = () => run(b, async () => { const { error } = await sb.from('trainings').update({ status: b.dataset.ap }).eq('id', b.dataset.id); if (error) throw error; toast('Listo', 'ok'); draw(); }));
    $$('[data-ppl]', el).forEach(b => b.onclick = () => {
      const t = all.find(x => x.id === b.dataset.ppl), rows = enr.filter(x => x.training_id === t.id && (isManager() || S.profiles.get(x.user_id)?.area === S.me.area));
      modal(`<h2>${esc(t.title)}</h2><div class="muted small">Participantes inscritos</div><div class="list" style="margin-top:8px">${rows.length ? rows.map(x => `<div class="item">${avatar(S.profiles.get(x.user_id), 'sm')}
        <div class="grow"><b>${esc(nameOf(x.user_id))}</b></div>${x.status === 'completada' ? '<span class="pill ok">Completada</span>' : `<button class="btn ok sm" data-fin="${x.user_id}">Completó</button>`}</div>`).join('') : '<div class="empty">Nadie inscrito aún</div>'}</div>`, (m, close) => {
        $$('[data-fin]', m).forEach(f => f.onclick = () => run(f, async () => {
          const { error } = await sb.from('training_enrollments').update({ status: 'completada', completed_at: new Date().toISOString() }).eq('training_id', t.id).eq('user_id', f.dataset.fin);
          if (error) throw error; close(); toast('Marcada como completada', 'ok'); draw(); })); });
    });
  };
  await draw();
};
function trainingForm(done) {
  const mgr = isManager();
  modal(`<h2>${mgr ? 'Crear capacitación' : 'Proponer capacitación'}</h2>${mgr ? '' : '<p class="muted small">Gerencia revisará tu propuesta antes de aprobarla.</p>'}
    <label>Nombre</label><input id="t-n" placeholder="Ej. Curso de primeros auxilios"><label>Tipo</label><select id="t-k"><option value="interna">Interna (dentro de Emporio)</option><option value="externa">Externa (otra institución)</option></select>
    <label>Institución / instructor</label><input id="t-p"><label>Descripción</label><textarea id="t-d"></textarea>
    <div class="grid2"><div><label>Inicio</label><input id="t-a" type="date"></div><div><label>Fin</label><input id="t-b" type="date"></div></div>
    <div class="grid2"><div><label>Horas</label><input id="t-h" type="number" min="0" step="any"></div><div><label>Enlace (opcional)</label><input id="t-u" type="url" placeholder="https://"></div></div>
    ${mgr ? '<label class="chk"><input type="checkbox" id="t-m"> Obligatoria para el equipo</label>' : ''}
    <button class="btn" id="t-go" style="margin-top:14px">${mgr ? 'Publicar' : 'Enviar propuesta'}</button>`, (m, close) => {
    $('#t-go', m).onclick = e => run(e.target, async () => {
      const v = id => $(id, m).value.trim() || null;
      const rec = { title: v('#t-n'), kind: v('#t-k'), provider: v('#t-p'), description: v('#t-d'), starts_on: v('#t-a'), ends_on: v('#t-b'),
        hours: v('#t-h') ? Number(v('#t-h')) : null, url: v('#t-u'), mandatory: mgr && $('#t-m', m).checked, status: mgr ? 'aprobada' : 'propuesta', created_by: S.me.id };
      if (!rec.title || rec.title.length < 3) throw new Error('Escribe el nombre');
      if (rec.url && !/^https?:\/\//.test(rec.url)) throw new Error('El enlace debe empezar con http:// o https://');
      const { error } = await sb.from('trainings').insert(rec); if (error) throw error; close(); toast(mgr ? 'Capacitación publicada' : 'Propuesta enviada', 'ok'); done();
    });
  });
}

/* ---------------- FEEDBACK Y SEGUIMIENTO ---------------- */
const FB_KIND = { reconocimiento: ['Reconocimiento', 'ok'], mejora: ['A mejorar', 'warn'], general: ['General', 'info'] };
const FB_ST = { abierto: ['Abierto', 'warn'], en_seguimiento: ['En seguimiento', 'info'], cerrado: ['Cerrado', 'ok'] };
V.feedback = async el => {
  let tab = 'recibido';
  const draw = async () => {
    const tabs = [['recibido', 'Recibido']]; if (isLead()) tabs.push(['seguimiento', 'Seguimiento'], ['dar', 'Dar feedback']);
    const [fb, nt] = await Promise.all([sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(120), sb.from('feedback_notes').select('*').order('created_at')]);
    if (fb.error) throw fb.error;
    const all = fb.data || [], notes = nt.data || [];
    const card = (f, lead) => { const k = FB_KIND[f.kind], st = FB_ST[f.followup_status], ns = notes.filter(n => n.feedback_id === f.id);
      return `<div class="card"><div class="row sb"><span class="pill ${k[1]}">${k[0]}</span><span class="tiny muted">${esc(fDT(f.created_at))}</span></div>
      <div class="small" style="margin:8px 0;white-space:pre-wrap">${esc(f.message)}</div>
      <div class="tiny muted">${lead ? 'Para ' + esc(nameOf(f.user_id)) + ' · ' : ''}De ${esc(nameOf(f.author_id))}</div>
      ${f.needs_followup ? `<div class="row" style="margin-top:8px"><span class="pill ${st[1]}">${st[0]}</span>${f.followup_due ? `<span class="tiny muted">Revisión: ${esc(fDate(f.followup_due))}</span>` : ''}</div>` : ''}
      ${ns.length ? `<div style="margin-top:10px">${ns.map(n => `<div class="small" style="border-left:3px solid var(--line);padding-left:8px;margin:6px 0"><b>${esc(nameOf(n.author_id))}</b> <span class="tiny muted">${esc(fDT(n.created_at))}</span><div style="white-space:pre-wrap">${esc(n.body)}</div></div>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:10px;flex-wrap:wrap">
        ${!lead && f.user_id === S.me.id && !f.acknowledged_at ? `<button class="btn ok sm" data-ack="${f.id}">Enterado ✓</button>` : (f.acknowledged_at && !lead ? '<span class="pill ok">Enterado</span>' : '')}
        ${lead && f.acknowledged_at ? '<span class="pill ok">Enterado por el colaborador</span>' : ''}
        ${f.needs_followup || ns.length || lead ? `<button class="btn sec2 sm" data-note="${f.id}">Agregar nota</button>` : ''}
        ${lead && f.needs_followup ? `<select data-st="${f.id}" style="width:auto;padding:7px">${opts(Object.entries(FB_ST).map(([v, l]) => [v, l[0]]), f.followup_status)}</select>` : ''}</div></div>`; };
    let body = '';
    if (tab === 'recibido') { const mine = all.filter(f => f.user_id === S.me.id); body = mine.length ? mine.map(f => card(f)).join('') : '<div class="empty">Aún no has recibido feedback</div>'; }
    else if (tab === 'seguimiento') { const fu = all.filter(f => f.needs_followup && f.user_id !== S.me.id);
      const open = fu.filter(f => f.followup_status !== 'cerrado'), closed = fu.filter(f => f.followup_status === 'cerrado');
      body = `${open.length ? open.map(f => card(f, true)).join('') : '<div class="empty">No hay seguimientos abiertos</div>'}${closed.length ? `<div class="sec">Cerrados</div>${closed.slice(0, 10).map(f => card(f, true)).join('')}` : ''}`; }
    else { const given = all.filter(f => f.author_id === S.me.id);
      body = `<button class="btn" id="f-new" style="margin-bottom:14px">＋ Dar feedback a un colaborador</button>${given.length ? '<div class="sec">Lo que he enviado</div>' + given.map(f => card(f, true)).join('') : ''}`; }
    el.innerHTML = tabsHtml(tabs, tab) + body;
    $$('.tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const nb = $('#f-new', el); if (nb) nb.onclick = () => feedbackForm(draw);
    $$('[data-ack]', el).forEach(b => b.onclick = () => run(b, async () => { const { error } = await sb.rpc('acknowledge_feedback', { p_id: b.dataset.ack }); if (error) throw error; draw(); }));
    $$('[data-st]', el).forEach(s => s.onchange = () => run(s, async () => { const { error } = await sb.from('feedback').update({ followup_status: s.value }).eq('id', s.dataset.st); if (error) throw error; toast('Estado actualizado', 'ok'); draw(); }));
    $$('[data-note]', el).forEach(b => b.onclick = () => modal(`<h2>Agregar nota</h2><textarea id="n-b" placeholder="Acuerdos, avances, comentarios…"></textarea>
      <button class="btn" id="n-go" style="margin-top:14px">Guardar nota</button>`, (m, close) => { $('#n-go', m).onclick = e => run(e.target, async () => {
      const body = $('#n-b', m).value.trim(); if (!body) throw new Error('Escribe la nota');
      const { error } = await sb.from('feedback_notes').insert({ feedback_id: b.dataset.note, body }); if (error) throw error; close(); draw(); }); }));
  };
  await draw();
};
function feedbackForm(done) {
  modal(`<h2>Dar feedback</h2><label>Colaborador</label>${personSelect('f-u')}<label>Tipo</label><select id="f-k">${opts(Object.entries(FB_KIND).map(([v, l]) => [v, l[0]]))}</select>
    <label>Mensaje</label><textarea id="f-m" placeholder="Sé específico: qué pasó, qué esperas y cómo puede mejorar"></textarea>
    <label class="chk"><input type="checkbox" id="f-s"> Requiere seguimiento</label><div id="f-d" class="hidden"><label>Fecha de revisión</label><input type="date" id="f-due"></div>
    <button class="btn" id="f-go" style="margin-top:14px">Enviar</button>`, (m, close) => {
    $('#f-s', m).onchange = e => $('#f-d', m).classList.toggle('hidden', !e.target.checked);
    $('#f-go', m).onclick = e => run(e.target, async () => {
      const rec = { user_id: $('#f-u', m).value, kind: $('#f-k', m).value, message: $('#f-m', m).value.trim(), needs_followup: $('#f-s', m).checked,
        followup_due: $('#f-s', m).checked ? ($('#f-due', m).value || null) : null, author_id: S.me.id };
      if (!rec.user_id) throw new Error('Elige a la persona'); if (rec.message.length < 3) throw new Error('Escribe el mensaje');
      const { error } = await sb.from('feedback').insert(rec); if (error) throw error; close(); toast('Feedback enviado', 'ok'); done();
    });
  });
}
