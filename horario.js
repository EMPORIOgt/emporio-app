/* Emporio Equipo — HORARIOS del equipo (turnos, descansos y días libres visibles para todos) */

V.horario = async el => {
  let ws = mondayOf(todayStr()), sel = todayStr();
  const DN = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const wk = () => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i));

  async function draw() {
    const days = wk();
    if (!days.includes(sel)) sel = days[0];
    const { data, error } = await sb.from('schedules').select('*').gte('work_date', days[0]).lte('work_date', days[6]);
    if (error) throw error;
    const rows = data || [];
    const mineByDay = Object.fromEntries(rows.filter(r => r.user_id === S.me.id).map(r => [r.work_date, r]));
    const people = team();
    const can = new Set(manageable().map(p => p.id));
    const today = todayStr();

    const desc = r => !r ? '<span class="pill">Sin horario</span>'
      : r.day_off ? '<span class="pill info">Descanso</span>'
      : `<b>${hhmm(r.start_time)}–${hhmm(r.end_time)}</b>${r.break_start ? `<div class="tiny muted">☕ ${hhmm(r.break_start)}–${hhmm(r.break_end)}</div>` : ''}`;

    const dayRows = rows.filter(r => r.work_date === sel);
    const list = people.map(p => ({ p, r: dayRows.find(x => x.user_id === p.id) }))
      .filter(x => x.r || can.has(x.p.id))
      .sort((a, b) => (a.r?.day_off ? 1 : 0) - (b.r?.day_off ? 1 : 0) || (a.r ? 0 : 1) - (b.r ? 0 : 1)
        || (a.r?.start_time || '99').localeCompare(b.r?.start_time || '99') || a.p.full_name.localeCompare(b.p.full_name));

    el.innerHTML = `
      <div class="row sb" style="margin-bottom:10px"><button class="btn sec2 sm" id="h-prev">‹</button>
        <b>${esc(fDate(days[0]))} – ${esc(fDate(days[6]))}</b><button class="btn sec2 sm" id="h-next">›</button></div>
      <div class="days">${days.map((d, i) => `<button data-d="${d}" class="${d === sel ? 'on' : ''} ${d === today ? 'today' : ''}"><span class="tiny">${DN[i]}</span><b>${new Date(d + 'T12:00').getDate()}</b></button>`).join('')}</div>
      <div class="card"><h3>Mi semana</h3>${days.map(d => `<div class="row sb" style="padding:6px 0;border-bottom:1px solid var(--line)">
        <span class="${d === today ? 'gold' : ''}">${esc(fDate(d, { weekday: 'short', day: 'numeric' }))}</span><span style="text-align:right">${desc(mineByDay[d])}</span></div>`).join('')}</div>
      <div class="sec">Equipo · ${esc(fDay(sel))}</div>
      <div class="card list" style="padding:4px 14px">${list.length ? list.map(({ p, r }) => `
        <div class="item" ${can.has(p.id) ? `data-edit="${p.id}" style="cursor:pointer"` : ''}>${avatar(p)}
          <div class="grow"><b>${esc(p.full_name)}${p.id === S.me.id ? ' <span class="gold tiny">(tú)</span>' : ''}</b><div class="tiny muted">${esc(p.area || ROLE_LABEL[p.role])}</div></div>
          <div style="text-align:right">${desc(r)}</div></div>`).join('')
        : '<div class="empty">Nadie tiene horario este día</div>'}</div>
      ${isLead() ? `<button class="btn sec2" id="h-copy">Copiar horarios de la semana anterior a esta semana</button>
        <p class="tiny muted" style="text-align:center">Toca a una persona de tu equipo para asignar o editar su horario.</p>` : ''}`;

    $('#h-prev', el).onclick = () => { ws = addDays(ws, -7); sel = ws; draw(); };
    $('#h-next', el).onclick = () => { ws = addDays(ws, 7); sel = ws; draw(); };
    $$('.days button', el).forEach(b => b.onclick = () => { sel = b.dataset.d; draw(); });
    $$('[data-edit]', el).forEach(it => it.onclick = () => editShift(S.profiles.get(it.dataset.edit), sel, dayRows.find(x => x.user_id === it.dataset.edit), draw));
    const cp = $('#h-copy', el);
    if (cp) cp.onclick = () => run(cp, async () => {
      const { data: prev, error: e1 } = await sb.from('schedules').select('*').gte('work_date', addDays(ws, -7)).lte('work_date', addDays(ws, -1));
      if (e1) throw e1;
      const out = (prev || []).filter(r => can.has(r.user_id)).map(r => ({
        user_id: r.user_id, work_date: addDays(r.work_date, 7), day_off: r.day_off, start_time: r.start_time, end_time: r.end_time,
        break_start: r.break_start, break_end: r.break_end, note: r.note }));
      if (!out.length) throw new Error('No hay horarios la semana anterior para copiar');
      const { error } = await sb.from('schedules').upsert(out, { onConflict: 'user_id,work_date', ignoreDuplicates: true });
      if (error) throw error;
      toast(`Se copiaron los horarios (los días que ya tenían horario no se tocaron)`, 'ok'); draw();
    });
  }
  await draw();
};

function editShift(p, day, row, done) {
  const r = row || {};
  modal(`<h2>${esc(p.full_name)}</h2><div class="muted small">${esc(fDay(day))}</div>
    <label class="chk"><input type="checkbox" id="s-off" ${r.day_off ? 'checked' : ''}> Día de descanso (libre)</label>
    <div id="s-times" class="${r.day_off ? 'hidden' : ''}">
      <div class="grid2"><div><label>Entrada</label><input type="time" id="s-in" value="${hhmm(r.start_time) || '06:00'}"></div>
        <div><label>Salida</label><input type="time" id="s-out" value="${hhmm(r.end_time) || '14:00'}"></div></div>
      <div class="grid2"><div><label>Descanso desde</label><input type="time" id="s-bs" value="${hhmm(r.break_start)}"></div>
        <div><label>Descanso hasta</label><input type="time" id="s-be" value="${hhmm(r.break_end)}"></div></div></div>
    <label>Nota (opcional)</label><input id="s-note" value="${esc(r.note || '')}" maxlength="120">
    <button class="btn" id="s-save" style="margin-top:14px">Guardar</button>
    ${row ? '<button class="btn bad" id="s-del" style="margin-top:10px">Quitar horario de este día</button>' : ''}`, (m, close) => {
    $('#s-off', m).onchange = e => $('#s-times', m).classList.toggle('hidden', e.target.checked);
    $('#s-save', m).onclick = e => run(e.target, async () => {
      const off = $('#s-off', m).checked, v = id => $(id, m).value || null;
      const rec = { user_id: p.id, work_date: day, day_off: off, note: v('#s-note'),
        start_time: off ? null : v('#s-in'), end_time: off ? null : v('#s-out'),
        break_start: off ? null : v('#s-bs'), break_end: off ? null : v('#s-be') };
      if (!off && rec.end_time <= rec.start_time) throw new Error('La salida debe ser después de la entrada (turnos que cruzan la medianoche aún no se admiten)');
      if (!off && (!!rec.break_start !== !!rec.break_end)) throw new Error('Completa el inicio y el fin del descanso, o deja ambos vacíos');
      const { error } = await sb.from('schedules').upsert(rec, { onConflict: 'user_id,work_date' });
      if (error) throw error; close(); toast('Horario guardado', 'ok'); done();
    });
    const del = $('#s-del', m);
    if (del) del.onclick = e => run(e.target, async () => {
      const { error } = await sb.from('schedules').delete().eq('id', row.id);
      if (error) throw error; close(); done();
    });
  });
}
