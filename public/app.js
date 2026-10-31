'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  view: 'doctors',
  filters: { q: '', specialization: '' },
};

/* ---------- helpers ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.token) signOut(true);
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3500);
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initials = (name) =>
  name.replace(/^Dr\.?\s*/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function signOut(expired = false) {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.view = 'doctors';
  render();
  if (expired) toast('Your session ended. Sign in again.', true);
}

/* ---------- nav ---------- */
function renderNav() {
  const nav = $('#nav');
  const u = state.user;
  const apptLabel = !u ? '' : u.role === 'patient' ? 'My appointments' : u.role === 'doctor' ? 'My schedule' : 'All appointments';
  nav.innerHTML = `
    <button data-view="doctors" ${state.view === 'doctors' ? 'aria-current="page"' : ''}>Find a doctor</button>
    ${u ? `<button data-view="appointments" ${state.view === 'appointments' ? 'aria-current="page"' : ''}>${apptLabel}</button>
           <span class="who">${esc(u.name)}</span>
           <button id="signout">Sign out</button>`
        : `<button id="signin" class="btn-light">Sign in</button>`}`;
  nav.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); })
  );
  $('#signout')?.addEventListener('click', () => signOut());
  $('#signin')?.addEventListener('click', () => openAuth('login'));
}

function render() {
  renderNav();
  if (state.view === 'appointments' && state.user) renderAppointments();
  else renderDoctors();
}

/* ---------- doctors ---------- */
async function renderDoctors() {
  const main = $('#main');
  main.innerHTML = `
    <h1>Book a doctor</h1>
    <p class="lede">Search by name or specialty, pick an open time, and you’re booked. No phone calls.</p>
    <div class="finder">
      <div class="field"><label for="q">Doctor name</label><input id="q" type="search" value="${esc(state.filters.q)}" placeholder="e.g. Sharma"></div>
      <div class="field"><label for="spec">Specialty</label><select id="spec"><option value="">All specialties</option></select></div>
    </div>
    <div id="results" class="list" aria-live="polite"></div>`;

  try {
    const { specializations } = await api('/doctors/specializations');
    const sel = $('#spec');
    sel.innerHTML += specializations.map((s) => `<option ${s === state.filters.specialization ? 'selected' : ''}>${esc(s)}</option>`).join('');
  } catch (e) { toast(e.message, true); }

  let timer;
  $('#q').addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(loadDoctors, 250);
  });
  $('#spec').addEventListener('change', (e) => { state.filters.specialization = e.target.value; loadDoctors(); });
  loadDoctors();
}

async function loadDoctors() {
  const box = $('#results');
  if (!box) return;
  const params = new URLSearchParams();
  if (state.filters.q.trim()) params.set('q', state.filters.q.trim());
  if (state.filters.specialization) params.set('specialization', state.filters.specialization);
  try {
    const { doctors } = await api('/doctors?' + params);
    if (!doctors.length) {
      box.innerHTML = '<p class="empty">No doctors match. Try a different name or clear the specialty.</p>';
      return;
    }
    box.innerHTML = doctors.map((d) => `
      <article class="doc">
        <div class="mono" aria-hidden="true">${esc(initials(d.name))}</div>
        <div>
          <h3>${esc(d.name)}</h3>
          <p class="spec">${esc(d.specialization)}</p>
          <p class="bio">${esc(d.bio)} ${d.experienceYears ? `${d.experienceYears} years of experience.` : ''}</p>
        </div>
        <div class="side">
          <span class="fee">₹${d.fee} <small>per visit</small></span>
          <button class="btn" data-book="${d._id}">Book a time</button>
        </div>
      </article>`).join('');
    box.querySelectorAll('[data-book]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const doctor = doctors.find((d) => d._id === btn.dataset.book);
        if (!state.user) return openAuth('login', 'Sign in to book with ' + doctor.name);
        if (state.user.role !== 'patient') return toast('Only patient accounts can book appointments', true);
        openScheduler({ doctor });
      })
    );
  } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

/* ---------- appointments ---------- */
async function renderAppointments() {
  const main = $('#main');
  const role = state.user.role;
  main.innerHTML = `<div class="tabs-head"><h1>${role === 'patient' ? 'My appointments' : role === 'doctor' ? 'My schedule' : 'All appointments'}</h1></div><div id="appts"></div>`;
  try {
    const { appointments } = await api('/appointments/mine');
    const box = $('#appts');
    if (!appointments.length) {
      box.innerHTML = role === 'patient'
        ? '<p class="empty">You have no appointments yet. Find a doctor to book your first one.</p>'
        : '<p class="empty">No appointments yet.</p>';
      return;
    }
    const today = ymd(new Date());
    const upcoming = appointments.filter((a) => a.status === 'booked' && a.date >= today);
    const past = appointments.filter((a) => !(a.status === 'booked' && a.date >= today)).reverse();
    const row = (a) => {
      const [y, m, d] = a.date.split('-').map(Number);
      const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
      const who = role === 'patient'
        ? `${esc(a.doctor.name)}<span class="meta"> – ${esc(a.doctor.specialization)}</span>`
        : `${esc(a.patient.name)}${role === 'admin' ? `<span class="meta"> with ${esc(a.doctor.name)}</span>` : ''}`;
      const canAct = a.status === 'booked';
      return `
      <article class="appt">
        <div class="when"><div class="day">${d}</div><div class="mon">${wd}, ${MONTHS[m - 1]} ${y}</div><div class="t">${fmtTime(a.time)}</div></div>
        <div>
          <p class="who-line">${who}<span class="badge ${a.status}">${a.status}</span></p>
          ${a.reason ? `<p class="meta">Reason: ${esc(a.reason)}</p>` : ''}
          ${role !== 'patient' ? `<p class="meta">${esc(a.patient.email)}</p>` : ''}
        </div>
        <div class="actions">
          ${canAct && role === 'patient' ? `<button class="btn ghost small" data-resched="${a._id}">Reschedule</button>` : ''}
          ${canAct && role !== 'patient' ? `<button class="btn ghost small" data-complete="${a._id}">Mark completed</button>` : ''}
          ${canAct ? `<button class="btn danger small" data-cancel="${a._id}">Cancel</button>` : ''}
        </div>
      </article>`;
    };
    box.innerHTML = `
      <h2>Upcoming</h2>
      <div class="list">${upcoming.length ? upcoming.map(row).join('') : '<p class="empty">Nothing upcoming.</p>'}</div>
      ${past.length ? `<p class="subhead">Past and cancelled</p><div class="list">${past.map(row).join('')}</div>` : ''}`;

    box.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Cancel this appointment? The time will open up for others.')) return;
      await act(`/appointments/${b.dataset.cancel}/cancel`, 'Appointment cancelled');
    }));
    box.querySelectorAll('[data-complete]').forEach((b) => b.addEventListener('click', () =>
      act(`/appointments/${b.dataset.complete}/complete`, 'Marked as completed')));
    box.querySelectorAll('[data-resched]').forEach((b) => b.addEventListener('click', async () => {
      const appt = appointments.find((a) => a._id === b.dataset.resched);
      const { doctor } = await api('/doctors/' + appt.doctor._id);
      openScheduler({ doctor, appointment: appt });
    }));
  } catch (e) { $('#appts').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

async function act(path, successMessage) {
  try {
    await api(path, { method: 'PATCH' });
    toast(successMessage);
    renderAppointments();
  } catch (e) { toast(e.message, true); }
}

/* ---------- scheduler dialog (book + reschedule) ---------- */
function openScheduler({ doctor, appointment }) {
  const dlg = $('#scheduler');
  const rescheduling = !!appointment;
  let selected = null;
  const today = new Date();
  const max = new Date(); max.setDate(max.getDate() + 60);

  dlg.innerHTML = `
    <div class="dlg">
      <div class="dlg-head">
        <div><h2 id="sch-title">${rescheduling ? 'Reschedule with' : 'Book'} ${esc(doctor.name)}</h2>
        <p>${esc(doctor.specialization)} – ₹${doctor.fee} per visit</p></div>
        <button type="button" class="x" data-close aria-label="Close">×</button>
      </div>
      <div class="field"><label for="sch-date">Date</label>
        <input id="sch-date" type="date" min="${ymd(today)}" max="${ymd(max)}" value="${ymd(today)}">
        <p class="hint">Bookings open up to 60 days ahead.</p></div>
      <p id="slots-label" style="font-weight:600;font-size:.92rem;margin-bottom:.3rem">Open times</p>
      <div id="slots" class="slots" aria-labelledby="slots-label"></div>
      ${rescheduling ? '' : `<div class="field" style="margin-top:1rem"><label for="reason">Reason for visit <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
        <textarea id="reason" maxlength="300" placeholder="Tell the doctor what you’d like to discuss"></textarea></div>`}
      <p class="err" id="sch-err" role="alert"></p>
      <div class="dlg-foot">
        <button type="button" class="btn ghost" data-close>Close</button>
        <button type="button" class="btn" id="confirm" disabled>${rescheduling ? 'Save new time' : 'Confirm booking'}</button>
      </div>
    </div>`;
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));

  const dateInput = $('#sch-date', dlg);
  const slotsBox = $('#slots', dlg);
  const confirmBtn = $('#confirm', dlg);
  const errBox = $('#sch-err', dlg);

  async function loadSlots() {
    selected = null;
    confirmBtn.disabled = true;
    errBox.textContent = '';
    if (!dateInput.value) return;
    slotsBox.innerHTML = '<p class="slots-note">Checking availability…</p>';
    try {
      const q = `date=${dateInput.value}` + (rescheduling ? `&exclude=${appointment._id}` : '');
      const { slots } = await api(`/doctors/${doctor._id}/slots?${q}`);
      if (!slots.length) {
        slotsBox.innerHTML = '<p class="slots-note">No open times on this date. Try another day.</p>';
        return;
      }
      slotsBox.innerHTML = slots.map((t) => `<button type="button" class="slot" aria-pressed="false" data-time="${t}">${fmtTime(t)}</button>`).join('');
      slotsBox.querySelectorAll('.slot').forEach((s) => s.addEventListener('click', () => {
        slotsBox.querySelectorAll('.slot').forEach((o) => o.setAttribute('aria-pressed', 'false'));
        s.setAttribute('aria-pressed', 'true');
        selected = s.dataset.time;
        confirmBtn.disabled = false;
      }));
    } catch (e) { slotsBox.innerHTML = `<p class="slots-note">${esc(e.message)}</p>`; }
  }
  dateInput.addEventListener('change', loadSlots);

  confirmBtn.addEventListener('click', async () => {
    if (!selected) return;
    confirmBtn.disabled = true;
    errBox.textContent = '';
    try {
      if (rescheduling) {
        await api(`/appointments/${appointment._id}/reschedule`, { method: 'PATCH', body: { date: dateInput.value, time: selected } });
        toast('Appointment rescheduled');
      } else {
        await api('/appointments', { method: 'POST', body: { doctorId: doctor._id, date: dateInput.value, time: selected, reason: $('#reason', dlg).value } });
        toast('Appointment booked');
      }
      dlg.close();
      state.view = 'appointments';
      render();
    } catch (e) {
      errBox.textContent = e.message;
      loadSlots(); // refresh in case the slot was just taken
      errBox.textContent = e.message;
    }
  });

  dlg.showModal();
  loadSlots();
}

/* ---------- auth dialog ---------- */
function openAuth(mode, prompt) {
  const dlg = $('#auth');
  const isLogin = mode === 'login';
  dlg.innerHTML = `
    <div class="dlg">
      <div class="dlg-head">
        <div><h2 id="auth-title">${isLogin ? 'Sign in' : 'Create your account'}</h2>
        ${prompt ? `<p>${esc(prompt)}</p>` : ''}</div>
        <button type="button" class="x" data-close aria-label="Close">×</button>
      </div>
      <form id="auth-form" novalidate>
        ${isLogin ? '' : '<div class="field"><label for="a-name">Full name</label><input id="a-name" autocomplete="name" required></div>'}
        <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="a-pass">Password</label><input id="a-pass" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="8" required>
          ${isLogin ? '' : '<p class="hint">At least 8 characters.</p>'}</div>
        <p class="err" id="auth-err" role="alert"></p>
        <div class="dlg-foot">
          <button type="button" class="switch" id="switch">${isLogin ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
          <button class="btn" type="submit">${isLogin ? 'Sign in' : 'Create account'}</button>
        </div>
      </form>
    </div>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  $('#switch', dlg).addEventListener('click', () => openAuth(isLogin ? 'register' : 'login', prompt));
  $('#auth-form', dlg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#auth-err', dlg);
    err.textContent = '';
    const body = { email: $('#a-email', dlg).value, password: $('#a-pass', dlg).value };
    if (!isLogin) body.name = $('#a-name', dlg).value;
    try {
      const { token, user } = await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body });
      setSession(token, user);
      dlg.close();
      state.view = user.role === 'patient' ? 'doctors' : 'appointments';
      render();
      toast(`Signed in as ${user.name}`);
    } catch (ex) { err.textContent = ex.message; }
  });
  if (!dlg.open) dlg.showModal();
  $(isLogin ? '#a-email' : '#a-name', dlg).focus();
}

$('#brand').addEventListener('click', (e) => { e.preventDefault(); state.view = 'doctors'; render(); });
render();
