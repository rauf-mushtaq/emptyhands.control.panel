import { backend, DEMO, isCoach, errorText } from './backend.js';
import { OWNER_EMAILS, STUDENT_URL, COACH_LOGIN_APPROVAL } from './config.js';
import {
  $, $$, esc, GRADES, DISCIPLINES, DOJOS, AUDIENCES, renderYear, legendHTML, loadCalendar, calendarYears,
  noticeIsFor, homeworkIsFor, DEFAULT_FEES, FEE_GROUPS, FEE_LEVELS, paypalLink, longDate,
  monthKey, monthName, isMonthly, monthlyFeeFor, money, PAY_METHODS, shortDate, timeAgo, keyOf, download, toast, busy, messageHTML,
} from './common.js';

let api;
const state = { user: null, students: [], notices: [], requests: null, chats: [], open: null, thread: [], view: 'requests', stops: [], stopThread: null, cm: 'private', group: [], journal: [], homework: [] };
const ed = { year: new Date().getFullYear(), days: {}, timings: [], pdf: '', dirty: false, published: false };
const NAME_KEY = 'eh-coach-name';
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

function showError(form, msg) { const el = $('.form-error', form); el.textContent = msg || ''; el.hidden = !msg; }

function show(id) {
  $('#loading').hidden = true;
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + id; });
  const inside = !['auth', 'denied', 'approval'].includes(id);
  $('#coach-tabs').hidden = !inside;
  $('#signout').hidden = !inside;
  $$('#coach-tabs button').forEach(b => b.toggleAttribute('aria-current', b.dataset.go === id));
  if (inside) state.view = id;
  if (id === 'menu') { drawChatList(); drawChannel(); if (state.open) markOpenRead(); }
  if (id === 'homework') drawHomeworkAdmin();
  if (id === 'payments') loadPayments();
}
$('#coach-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  state.autoStart = false;
  show(b.dataset.go);
  history.replaceState(null, '', '#' + b.dataset.go);
  if (b.dataset.go === 'students') loadStudents();
  if (b.dataset.go === 'coaches') drawCoaches();
});

// ---- auth ----
let mode = 'signin';
$$('[data-auth]').forEach(btn => btn.addEventListener('click', () => {
  mode = btn.dataset.auth;
  $$('[data-auth]').forEach(b => b.setAttribute('aria-selected', b === btn));
  $('.only-signup').hidden = mode !== 'signup';
  $('#forgot').hidden = mode === 'signup';
  const form = $('#form-auth');
  form.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  form.querySelector('[type=submit]').textContent = mode === 'signup' ? 'Create Sensei account' : 'Sign in';
  showError(form);
}));

$('#form-auth').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  await busy(form.querySelector('[type=submit]'), async () => {
    try {
      if (mode === 'signup') {
        try { localStorage.setItem(NAME_KEY, form.name.value.trim()); } catch { /* storage blocked */ }
        await api.signUp(form.email.value, form.password.value, { coach: true });
        if (!DEMO) await api.sendVerification();
      } else {
        await api.signIn(form.email.value, form.password.value);
      }
    } catch (err) { showError(form, errorText(err)); }
  });
});
$('#forgot').addEventListener('click', async () => {
  const form = $('#form-auth');
  if (!form.email.value.trim()) return showError(form, 'Enter your email above first.');
  try { await api.resetPassword(form.email.value); toast('Password reset email sent'); } catch (err) { showError(form, errorText(err)); }
});
$('#signout').addEventListener('click', () => { if (!ed.dirty || confirm('You have unpublished calendar changes. Sign out anyway?')) api.signOut(); });
$('#denied-signout').addEventListener('click', () => api.signOut());
$('#resend').addEventListener('click', async () => {
  try { await api.sendVerification(); toast('Verification email sent to ' + state.user.email + ' — check Junk / Spam too'); } catch (err) { toast(errorText(err), 'bad'); }
});
$('#recheck').addEventListener('click', async () => onAuth(await api.reloadUser()));

// ---- sign-in approval: each new sign-in waits for the owner to approve it by email ----
const OWNER = OWNER_EMAILS[0];
async function approved(user) {
  const authTime = await api.signInTime();
  const session = await new Promise(res => { const stop = api.watchCoachSession(user.uid, s => { stop(); res(s); }); });
  if (session && session.authTime === authTime) return true;
  $('#approval-why').innerHTML = `For security, we’ve emailed <b>${esc(OWNER)}</b> to check it’s really you signing in as <b>${esc(user.email)}</b>. Open that email and tap <b>Approve</b>.`;
  show('approval');
  await askApproval(user, authTime);
  state.stops.push(api.watchCoachSession(user.uid, async s => {
    if (!s || state.user !== user) return;
    if (s.deniedAuthTime === authTime) {
      toast('This sign-in was declined.', 'bad');
      api.signOut();
    } else if (s.authTime === authTime) {
      await api.refreshToken();
      toast('Sign-in approved');
      onAuth(user);
    }
  }));
  return false;
}
let lastAsk = 0;
async function askApproval(user, authTime) {
  if (Date.now() - lastAsk < 30000) return toast('Please wait a moment before sending another email.');
  lastAsk = Date.now();
  try { await api.requestCoachLogin(user.uid, user.email, authTime); } catch (err) { toast(errorText(err), 'bad'); }
}
$('#approval-resend').addEventListener('click', async () => {
  if (!state.user) return;
  await askApproval(state.user, await api.signInTime());
  toast('Approval email sent to ' + OWNER);
});
$('#approval-signout').addEventListener('click', () => api.signOut());

async function onAuth(user) {
  state.stops.forEach(stop => stop && stop());
  state.stops = [];
  closeChat();
  state.requests = null;
  state.user = user;
  if (!user) { show('auth'); return; }
  if (!(await isCoach(user))) {
    const listed = OWNER_EMAILS.map(x => x.toLowerCase()).includes(user.email) || (await api.getCoaches().catch(() => [])).includes(user.email);
    $('#denied-why').innerHTML = !user.emailVerified && listed
      ? `We’ve sent a verification link to <b>${esc(user.email)}</b>. Open it, then come back and press “check again”. It comes from <b>noreply@emptyhands-student-portal.firebaseapp.com</b>, so if it isn’t there within a few minutes, look in <b>Junk / Spam</b>.`
      : `<b>${esc(user.email)}</b> isn’t on the Sensei list. Ask a head Sensei to add it under <i>Sensei</i>, then verify your email.`;
    $('#resend').hidden = user.emailVerified;
    show('denied');
    return;
  }
  if (COACH_LOGIN_APPROVAL && !(await approved(user))) return;
  $('#form-notice [name=from]').value = savedName();
  $('#reply-from').value = savedName();
  $('#form-homework').from.value = savedName();
  state.stops.push(api.watchChannel('group', list => { state.group = list; drawChannel(); }));
  state.stops.push(api.watchChannel('journal', list => { state.journal = list; drawChannel(); }));
  state.stops.push(api.watchHomework(list => { state.homework = list; drawHomeworkAdmin(); }));
  state.stops.push(api.watchNotifications(list => { state.notices = list; drawSent(); }));
  state.stops.push(api.watchRequests(onRequests));
  state.stops.push(api.watchChats(list => { state.chats = list; drawChatList(); drawMenuCount(); }));
  await loadStudents();
  await loadYear(ed.year);
  const start = location.hash.slice(1);
  const chosen = ['requests', 'menu', 'notices', 'homework', 'payments', 'students', 'calendar', 'coaches'].includes(start);
  if (start === 'payments') loadPayments();
  show(chosen ? start : (state.requests || []).length ? 'requests' : 'menu');
  // The request list may load after this; if there are requests waiting, open on them.
  state.autoStart = !chosen;
  if (start === 'coaches') drawCoaches();
}

// ---- join requests ----
function onRequests(list) {
  const before = state.requests;
  state.requests = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!before && list.length && state.autoStart && state.view === 'menu') show('requests');
  if (before) {
    list.filter(r => !before.some(x => x.id === r.id)).forEach(r => {
      toast('New join request: ' + r.name);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('New join request', { body: r.name + ' wants to join EmptyHands', tag: 'req-' + r.id }); } catch { /* not allowed here */ }
      }
    });
  }
  $('#request-count').textContent = list.length || '';
  document.title = (list.length ? `(${list.length}) ` : '') + 'EmptyHands · Sensei panel';
  drawRequests();
}
function drawRequests() {
  const list = state.requests || [];
  $('#coach-alerts').hidden = !('Notification' in window) || Notification.permission !== 'default';
  $('#request-list').innerHTML = list.length ? list.map(r => `
    <article class="card request">
      <div class="request-main">
        <h3>${esc(r.name)}</h3>
        ${r.guardian ? `<p class="muted">Parent / guardian: ${esc(r.guardian)}</p>` : ''}
        <p>${(r.disciplines || []).map(d => `<span class="tag">${DISCIPLINES[d] || esc(d)}</span>`).join(' ')}
          <span class="tag">${DOJOS[r.dojo] || '—'}</span> <span class="tag">${GRADES[r.grade] || '—'}</span></p>
        <p class="fine"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? ` · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : ''} · asked ${r.createdAt ? timeAgo(r.createdAt) : ''}</p>
      </div>
      <div class="request-actions">
        <button class="btn btn--seal btn--sm" data-accept="${esc(r.id)}">Accept</button>
        <button class="btn btn--ghost btn--sm" data-decline="${esc(r.id)}">Decline</button>
      </div>
    </article>`).join('') : '<div class="empty"><span aria-hidden="true">迎</span><p>No requests waiting. New student sign-ups will appear here.</p></div>';
}
$('#request-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-accept], [data-decline]');
  if (!b) return;
  const accept = 'accept' in b.dataset;
  const uid = b.dataset.accept || b.dataset.decline;
  const r = (state.requests || []).find(x => x.id === uid);
  if (!accept && !confirm(`Decline ${r ? r.name : 'this request'}? They won’t be able to use the EmptyHands menu.`)) return;
  await busy(b, async () => {
    try {
      await api.saveProfile(uid, accept ? { role: 'student', acceptedAt: Date.now() } : { role: 'declined' });
      toast(accept ? `${r.name} accepted and added to the EmptyHands menu` : `${r.name}’s request declined`);
      loadStudents();
    } catch (err) { toast(errorText(err), 'bad'); }
  });
});
$('#coach-alerts').addEventListener('click', async () => {
  const res = await Notification.requestPermission();
  toast(res === 'granted' ? 'Pop-up alerts on while this panel is open.' : 'Alerts are off. You can change this in your browser settings.');
  drawRequests();
});

// ---- EmptyHands menu: private chat with each student's family ----
const unreadChat = c => c && c.lastFrom === 'student' && (c.lastAt || 0) > (c.coachReadAt || 0);
function drawMenuCount() {
  const n = state.chats.filter(unreadChat).length;
  $('#menu-count').textContent = n || '';
  $('[data-cm=private] .dot').hidden = !n;
}

// Group chat and training journal: everyone can see them; Sensei can delete any message.
const CM_INTRO = {
  group: 'Group chat for every accepted student, their family and Sensei. Your messages show in bold.',
  journal: 'Students share what they’ve practised. Reply to encourage them — your messages show in bold.',
};
$('.menu-switch').addEventListener('click', e => {
  const b = e.target.closest('[data-cm]');
  if (!b) return;
  state.cm = b.dataset.cm;
  $$('.menu-switch [data-cm]').forEach(x => x.setAttribute('aria-selected', x === b));
  drawChannel();
});
function drawChannel() {
  const ch = state.cm;
  $('#menu-layout').hidden = ch !== 'private';
  $('#channel-pane').hidden = ch === 'private';
  if (ch === 'private') return;
  $('#channel-intro').textContent = CM_INTRO[ch];
  $('#channel-text').placeholder = ch === 'group' ? 'Write to everyone…' : 'Reply in the training journal…';
  const feed = $('#channel-feed');
  feed.innerHTML = state[ch].length ? state[ch].map(m => messageHTML(m, m.from === 'coach', true)).join('')
    : '<p class="muted fine center">Nothing here yet.</p>';
  feed.scrollTop = feed.scrollHeight;
}
$('#channel-feed').addEventListener('click', async e => {
  const b = e.target.closest('[data-delmsg]');
  if (!b || !confirm('Delete this message for everyone?')) return;
  try { await api.deleteChannelMessage(state.cm, b.dataset.delmsg); } catch (err) { toast(errorText(err), 'bad'); }
});
const channelText = $('#channel-text');
channelText.addEventListener('input', () => { channelText.style.height = 'auto'; channelText.style.height = Math.min(channelText.scrollHeight, 160) + 'px'; });
channelText.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#form-channel').requestSubmit(); } });
$('#form-channel').addEventListener('submit', async e => {
  e.preventDefault();
  const text = channelText.value.trim();
  if (!text || state.cm === 'private') return;
  const author = $('#reply-from').value.trim() || savedName() || 'Sensei';
  await busy(e.target.querySelector('[type=submit]'), async () => {
    try {
      await api.postChannel(state.cm, { text, from: 'coach', author, uid: state.user.uid });
      channelText.value = ''; channelText.style.height = 'auto';
    } catch (err) { toast(errorText(err), 'bad'); }
  });
});

// ---- payments (PayPal) ----
const pay = { fees: [], dirty: false };
async function loadPayments() {
  if (pay.dirty) return;
  let s = null;
  try { s = await api.getPayments(); } catch (err) { toast(errorText(err), 'bad'); }
  $('#paypal-account').value = (s && s.paypal) || '';
  $('#auto-remind').checked = !!(s && s.autoRemind);
  pay.fees = structuredClone((s && s.fees) || DEFAULT_FEES);
  drawFees();
  if (!pay.month) pickMonth(monthKey());
}

// ---- who has paid ----
function pickMonth(m) {
  pay.month = m;
  const months = [];
  for (let i = 0; i < 6; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(monthKey(d)); }
  $('#paid-month').innerHTML = months.map(k => `<option value="${k}"${k === m ? ' selected' : ''}>${monthName(k)}</option>`).join('');
  if (pay.stop) pay.stop();
  pay.stop = api.watchPaymentsForMonth(m, list => { pay.list = list; drawPaid(); });
}
$('#paid-month').addEventListener('change', e => pickMonth(e.target.value));
const reminded = s => ((s.feeReminded || {})[pay.month]) || 0;
function paidRows() {
  return state.students.filter(s => s.role === 'student').map(s => ({ s, pmt: (pay.list || []).find(x => x.uid === s.id && isMonthly(x)) }));
}
function drawPaid() {
  const rows = paidRows();
  const due = rows.filter(r => !r.s.feesExempt);
  const paid = due.filter(r => r.pmt).length;
  const unpaid = due.filter(r => !r.pmt);
  $('#paid-summary').textContent = due.length ? `· ${paid} of ${due.length} paid` : '';
  $('#remind-all').disabled = !unpaid.length;
  $('#remind-all').textContent = unpaid.length ? `Remind everyone unpaid (${unpaid.length})` : 'Everyone has paid';
  rows.sort((a, b) => !!a.pmt - !!b.pmt || !!a.s.feesExempt - !!b.s.feesExempt || a.s.name.localeCompare(b.s.name));
  $('#paid-rows').innerHTML = rows.map(({ s, pmt }) => `<tr>
    <td data-th="Student"><b>${esc(s.name)}</b>${s.guardian ? `<small>Parent: ${esc(s.guardian)}</small>` : ''}</td>
    <td data-th="Belt">${GRADES[s.grade] || '—'}</td>
    <td data-th="Status">${s.feesExempt ? '<span class="tag">Exempt</span>'
      : pmt ? `<span class="tag tag--ok">Paid</span> ${money(pmt.amount)} · ${PAY_METHODS[pmt.method] || ''} · ${new Date(pmt.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : `<span class="tag tag--seal">Unpaid</span>${reminded(s) ? ` <small>reminded ${timeAgo(reminded(s))}</small>` : ''}`}</td>
    <td>${pmt ? `<button class="linkish" data-unpay="${esc(pmt.id)}">Undo</button>`
      : s.feesExempt ? `<button class="linkish" data-exempt="${esc(s.id)}">Not exempt</button>`
      : `<button class="linkish" data-markpaid="${esc(s.id)}">Mark paid</button> <button class="linkish" data-remind="${esc(s.id)}">Remind</button> <button class="linkish" data-exempt="${esc(s.id)}">Exempt</button>`}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="muted">No accepted students yet.</td></tr>';
  const strays = (pay.list || []).filter(x => !x.uid || !state.students.some(s => s.id === x.uid));
  $('#unmatched').innerHTML = strays.length ? `<h3>PayPal payments not linked to a student</h3><ul class="plain">${strays.map(x => `<li><span>${money(x.amount)} · ${esc(x.feeName || '')} · ${esc(x.payer || '')}</span><button class="linkish danger" data-unpay="${esc(x.id)}">Remove</button></li>`).join('')}</ul>` : '';
}
async function remind(s) {
  const author = savedName() || 'Sensei';
  const text = `Hi ${s.name.split(' ')[0]}, just a reminder that your ${monthName(pay.month)} fees haven’t been paid yet. You can pay in the app under Home → Pay fees, or at the dojo. Thank you!`;
  await api.sendMessage(s.id, s.name, { text, from: 'coach', author, uid: state.user.uid });
  const feeReminded = { ...(s.feeReminded || {}), [pay.month]: Date.now() };
  await api.saveProfile(s.id, { feeReminded });
  s.feeReminded = feeReminded;
}
$('#paid-rows').addEventListener('click', async e => {
  const b = e.target.closest('[data-markpaid], [data-remind], [data-unpay], [data-exempt]');
  if (!b) return;
  const d = b.dataset;
  const s = state.students.find(x => x.id === (d.markpaid || d.remind || d.exempt));
  try {
    if (d.markpaid) {
      const fee = monthlyFeeFor(pay.fees, s) || { name: 'Monthly fee', price: '' };
      const f = $('#form-paid');
      f.reset();
      f.amount.value = fee.price;
      $('#paid-title').textContent = 'Mark ' + s.name + ' as paid';
      $('#paid-month-label').textContent = monthName(pay.month) + ' · ' + fee.name;
      $('#paid-dialog').dataset.uid = s.id;
      showError(f);
      $('#paid-dialog').showModal();
    } else if (d.unpay) {
      if (!confirm('Remove this payment record?')) return;
      await api.deletePayment(d.unpay);
    } else if (d.remind) {
      await busy(b, () => remind(s));
      toast(`Reminder sent to ${s.name}`); drawPaid();
    } else if (d.exempt) {
      s.feesExempt = !s.feesExempt;
      await api.saveProfile(s.id, { feesExempt: s.feesExempt });
      drawPaid();
    }
  } catch (err) { toast(errorText(err), 'bad'); }
});
$('#form-paid').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault();
  const f = e.target;
  const amount = Number(f.amount.value);
  if (!(amount > 0)) return showError(f, 'Please enter the amount they paid.');
  const s = state.students.find(x => x.id === $('#paid-dialog').dataset.uid);
  const fee = monthlyFeeFor(pay.fees, s) || { name: 'Monthly fee' };
  await busy(f.querySelector('[value=save]'), async () => {
    try {
      await api.addPayment({ uid: s.id, name: s.name, feeId: fee.id || '', feeName: fee.name, amount, month: pay.month, kind: 'monthly', method: f.method.value, by: savedName() || state.user.email });
      $('#paid-dialog').close();
      toast(`${s.name} marked as paid`);
    } catch (err) { showError(f, errorText(err)); }
  });
});
$('#unmatched').addEventListener('click', async e => {
  const b = e.target.closest('[data-unpay]');
  if (b && confirm('Remove this payment record?')) { try { await api.deletePayment(b.dataset.unpay); } catch (err) { toast(errorText(err), 'bad'); } }
});
$('#remind-all').addEventListener('click', e => busy(e.currentTarget, async () => {
  const unpaid = paidRows().filter(r => !r.s.feesExempt && !r.pmt).map(r => r.s);
  if (!unpaid.length || !confirm(`Send a payment reminder to ${unpaid.length} student${unpaid.length === 1 ? '' : 's'}?`)) return;
  let n = 0;
  for (const s of unpaid) { try { await remind(s); n++; } catch (err) { console.warn(err); } }
  toast(`Reminder sent to ${n} student${n === 1 ? '' : 's'}`);
  drawPaid();
}));
$('#auto-remind').addEventListener('change', () => { pay.dirty = true; toast('Press Save to keep this setting'); });
const opts = (map, v, blank) => (blank ? `<option value="">${blank}</option>` : '') + Object.entries(map).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${n}</option>`).join('');
function drawFees() {
  $('#fee-rows').innerHTML = pay.fees.map((f, i) => `<tr data-i="${i}">
    <td data-th="Group"><select data-k="group">${opts(FEE_GROUPS, f.group || 'other')}</select></td>
    <td data-th="Fee"><input data-k="name" value="${esc(f.name)}" maxlength="80" aria-label="Fee name"></td>
    <td data-th="Price"><input data-k="price" type="number" min="0" step="0.5" value="${esc(f.price)}" aria-label="Price in pounds"></td>
    <td data-th="Per"><input data-k="per" value="${esc(f.per || '')}" maxlength="20" placeholder="e.g. month" aria-label="Per"></td>
    <td data-th="Note"><input data-k="note" value="${esc(f.note || '')}" maxlength="100" aria-label="Note"></td>
    <td data-th="Level"><select data-k="level">${opts(FEE_LEVELS, f.level || '', 'Any')}</select></td>
    <td><button type="button" class="linkish" data-copy="${i}">Copy link</button> <button type="button" class="linkish danger" data-delfee="${i}">Remove</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">No fees — add one.</td></tr>';
}
$('#fee-rows').addEventListener('input', e => {
  const el = e.target.closest('[data-k]');
  if (!el) return;
  const f = pay.fees[+el.closest('tr').dataset.i];
  f[el.dataset.k] = el.dataset.k === 'price' ? Number(el.value) : el.value.trim();
  if (el.dataset.k === 'level' && !el.value) delete f.level;
  pay.dirty = true;
});
$('#paypal-account').addEventListener('input', () => { pay.dirty = true; });
$('#fee-rows').addEventListener('click', async e => {
  const del = e.target.closest('[data-delfee]');
  const copy = e.target.closest('[data-copy]');
  if (del) { pay.fees.splice(+del.dataset.delfee, 1); pay.dirty = true; drawFees(); }
  if (copy) {
    const paypal = $('#paypal-account').value.trim();
    if (!paypal) return toast('Add your PayPal account first', 'bad');
    const link = paypalLink(paypal, pay.fees[+copy.dataset.copy]);
    try { await navigator.clipboard.writeText(link); toast('PayPal link copied — paste it into a message or notice'); }
    catch { prompt('Copy this PayPal link:', link); }
  }
});
$('#add-fee').addEventListener('click', () => {
  pay.fees.push({ id: 'f' + Date.now().toString(36), group: 'other', name: 'New fee', price: 10, per: '', note: '' });
  pay.dirty = true; drawFees();
  $('#fee-rows tr:last-child [data-k=name]').select();
});
$('#reset-fees').addEventListener('click', () => {
  if (!confirm('Replace the list with the prices from the website’s Fees page?')) return;
  pay.fees = structuredClone(DEFAULT_FEES); pay.dirty = true; drawFees();
});
$('#save-payments').addEventListener('click', e => busy(e.currentTarget, async () => {
  const paypal = $('#paypal-account').value.trim();
  const bad = pay.fees.find(f => !f.name || !(f.price > 0));
  if (bad) return toast('Every fee needs a name and a price above £0', 'bad');
  if (paypal && !/^(\S+@\S+\.\S+|[A-Z0-9]{10,16})$/i.test(paypal)) return toast('That doesn’t look like a PayPal email or merchant ID', 'bad');
  try {
    await api.savePayments({ paypal, fees: pay.fees, autoRemind: $('#auto-remind').checked });
    pay.dirty = false;
    toast(paypal ? 'Saved — students can now pay with PayPal' : 'Saved. Add your PayPal account so students can pay.');
  } catch (err) { toast(errorText(err), 'bad'); }
}));

// ---- homework ----
function drawHomeworkTargets() {
  const sel = $('#hw-target');
  const keep = sel.value;
  const students = state.students.filter(s => s.role === 'student');
  sel.innerHTML = '<optgroup label="Groups">' + Object.entries(AUDIENCES).map(([k, v]) => `<option value="a:${k}">${v}</option>`).join('') + '</optgroup>'
    + (students.length ? '<optgroup label="One student">' + students.map(s => `<option value="s:${esc(s.id)}">${esc(s.name)}</option>`).join('') + '</optgroup>' : '');
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function hwTargets(h) { return state.students.filter(s => s.role === 'student' && homeworkIsFor(h, s.id, s)); }
function drawHomeworkAdmin() {
  const box = $('#hw-admin');
  if (!box) return;
  box.innerHTML = state.homework.length ? state.homework.map(h => {
    const who = hwTargets(h);
    const done = who.filter(s => (s.homeworkDone || {})[h.id]);
    const todo = who.filter(s => !(s.homeworkDone || {})[h.id]);
    const pct = who.length ? Math.round(done.length / who.length * 100) : 0;
    const forWho = h.student ? (state.students.find(s => s.id === h.student) || {}).name || 'One student' : AUDIENCES[h.audience] || 'Everyone';
    return `<article class="card">
      <header class="notice-head"><span class="aud eyebrow">${esc(forWho)}${h.due ? ' · due ' + shortDate(h.due) : ''}</span></header>
      <h3>${esc(h.title)}</h3>
      ${h.details ? `<p class="muted">${esc(h.details).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="hw-progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <p class="fine"><b>${done.length} of ${who.length}</b> done · set ${timeAgo(h.createdAt)}${h.from ? ' by ' + esc(h.from) : ''}</p>
      ${who.length ? `<details><summary>Who’s done it</summary><ul>
        ${done.map(s => `<li class="done">✓ ${esc(s.name)}</li>`).join('')}${todo.map(s => `<li>${esc(s.name)} — not yet</li>`).join('')}</ul></details>` : ''}
      <p class="row-actions"><button class="linkish danger" data-delhw="${esc(h.id)}">Delete</button></p>
    </article>`;
  }).join('') : '<div class="empty"><span aria-hidden="true">宿</span><p>No homework set yet.</p></div>';
}
$('#hw-admin').addEventListener('click', async e => {
  const b = e.target.closest('[data-delhw]');
  if (!b || !confirm('Delete this homework for everyone?')) return;
  try { await api.deleteHomework(b.dataset.delhw); toast('Homework deleted'); } catch (err) { toast(errorText(err), 'bad'); }
});
$('#refresh-hw').addEventListener('click', e => busy(e.currentTarget, loadStudents));
$('#form-homework').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  const [kind, val] = form.target.value.split(':');
  const h = { title: form.title.value.trim(), details: form.details.value.trim(), due: form.due.value || '', from: form.from.value.trim(), ...(kind === 's' ? { student: val, audience: 'all' } : { student: '', audience: val }) };
  if (!h.title) return showError(form, 'Please say what the homework is.');
  await busy(form.querySelector('[type=submit]'), async () => {
    try {
      await api.addHomework(h);
      try { localStorage.setItem(NAME_KEY, h.from); } catch { /* storage blocked */ }
      form.title.value = ''; form.details.value = ''; form.due.value = '';
      toast('Homework sent — ' + hwTargets({ ...h, id: '' }).length + ' student(s) will see it');
    } catch (err) { showError(form, errorText(err)); }
  });
});
function drawChatList() {
  const q = $('#chat-search').value.trim().toLowerCase();
  const chats = Object.fromEntries(state.chats.map(c => [c.id, c]));
  const people = state.students.filter(s => s.role === 'student')
    .filter(s => !q || [s.name, s.guardian, s.email].some(v => (v || '').toLowerCase().includes(q)))
    .map(s => ({ ...s, chat: chats[s.id] }))
    .sort((a, b) => ((b.chat && b.chat.lastAt) || 0) - ((a.chat && a.chat.lastAt) || 0) || (a.name || '').localeCompare(b.name || ''));
  $('#chat-list').innerHTML = people.length ? people.map(p => `
    <li><button type="button" class="chat-item${unreadChat(p.chat) ? ' is-unread' : ''}${state.open === p.id ? ' is-open' : ''}" data-chat="${esc(p.id)}">
      <b>${esc(p.name)}</b>${p.chat ? `<time>${timeAgo(p.chat.lastAt)}</time>` : ''}
      <small>${p.chat ? (p.chat.lastFrom === 'coach' ? 'You: ' : '') + esc(p.chat.lastText) : esc(p.guardian ? 'Parent: ' + p.guardian : 'No messages yet')}</small>
    </button></li>`).join('') : '<li class="muted fine">No accepted students yet.</li>';
}
$('#chat-search').addEventListener('input', drawChatList);
$('#chat-list').addEventListener('click', e => {
  const b = e.target.closest('[data-chat]');
  if (b) openChat(b.dataset.chat);
});
$('#chat-back').addEventListener('click', closeChat);

function openChat(uid) {
  closeChat();
  const s = state.students.find(x => x.id === uid);
  state.open = uid;
  $('#chat-name').textContent = s ? s.name : 'Student';
  $('#chat-sub').innerHTML = s ? [s.guardian && 'Parent: ' + esc(s.guardian), (s.disciplines || []).map(d => DISCIPLINES[d]).join(', '), DOJOS[s.dojo], GRADES[s.grade]].filter(Boolean).join(' · ') : '';
  $('#chat-empty').hidden = true;
  $('#chat-open').hidden = false;
  $('#menu-layout').classList.add('is-open');
  state.stopThread = api.watchThread(uid, list => { state.thread = list; drawThread(); markOpenRead(); });
  drawChatList();
  $('#reply-text').focus();
}
function closeChat() {
  if (state.stopThread) state.stopThread();
  state.stopThread = null; state.open = null; state.thread = [];
  $('#chat-open').hidden = true;
  $('#chat-empty').hidden = false;
  $('#menu-layout').classList.remove('is-open');
  drawChatList();
}
function drawThread() {
  const feed = $('#chat-feed');
  feed.innerHTML = state.thread.length
    ? state.thread.map(m => messageHTML(m, m.from === 'coach')).join('')
    : '<p class="muted fine center">No messages yet. Say hello — the student and their family will see it in their EmptyHands menu.</p>';
  feed.scrollTop = feed.scrollHeight;
}
function markOpenRead() {
  const c = state.chats.find(x => x.id === state.open);
  if (state.view === 'menu' && !document.hidden && unreadChat(c)) api.markChatRead(state.open, 'coach').catch(console.warn);
}
document.addEventListener('visibilitychange', () => { if (state.open) markOpenRead(); });

const replyText = $('#reply-text');
replyText.addEventListener('input', () => { replyText.style.height = 'auto'; replyText.style.height = Math.min(replyText.scrollHeight, 160) + 'px'; });
replyText.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#form-reply').requestSubmit(); } });
$('#form-reply').addEventListener('submit', async e => {
  e.preventDefault();
  const text = replyText.value.trim();
  if (!text || !state.open) return;
  const author = $('#reply-from').value.trim() || 'Sensei';
  const s = state.students.find(x => x.id === state.open);
  await busy(e.target.querySelector('[type=submit]'), async () => {
    try {
      await api.sendMessage(state.open, s ? s.name : '', { text, from: 'coach', author, uid: state.user.uid });
      try { localStorage.setItem(NAME_KEY, author); } catch { /* storage blocked */ }
      replyText.value = ''; replyText.style.height = 'auto';
    } catch (err) { toast(errorText(err), 'bad'); }
  });
});

// ---- notices ----
$('#audience').innerHTML = Object.entries(AUDIENCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
const reach = a => state.students.filter(s => s.role === 'student' && noticeIsFor({ audience: a }, s)).length;
function drawReach() {
  const n = reach($('#audience').value);
  $('#reach').textContent = `Goes to ${n} registered student${n === 1 ? '' : 's'}.`;
}
$('#audience').addEventListener('change', drawReach);

$('#form-notice').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  showError(form);
  const n = { title: form.title.value.trim(), body: form.body.value.trim(), audience: form.audience.value, from: form.from.value.trim() };
  if (!n.title || !n.body) return showError(form, 'Please add a title and a message.');
  await busy(form.querySelector('[type=submit]'), async () => {
    try {
      await api.addNotification(n);
      try { localStorage.setItem(NAME_KEY, n.from); } catch { /* storage blocked */ }
      form.title.value = ''; form.body.value = '';
      toast('Notice sent to ' + AUDIENCES[n.audience].toLowerCase());
    } catch (err) { showError(form, errorText(err)); }
  });
});

function drawSent() {
  $('#sent-list').innerHTML = state.notices.length ? state.notices.map(n => `
    <article class="notice">
      <header><span class="aud">${esc(AUDIENCES[n.audience] || 'Everyone')}</span><time>${timeAgo(n.createdAt)}</time></header>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.body).replace(/\n/g, '<br>')}</p>
      <footer>${n.from ? '— ' + esc(n.from) : ''}<button class="linkish danger" data-del="${esc(n.id)}">Delete</button></footer>
    </article>`).join('') : '<div class="empty"><span aria-hidden="true">便</span><p>No notices sent yet.</p></div>';
}
$('#sent-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirm('Delete this notice for everyone?')) return;
  try { await api.deleteNotification(b.dataset.del); toast('Notice deleted'); } catch (err) { toast(errorText(err), 'bad'); }
});

// ---- students ----
$('#student-filter').innerHTML = '<option value="all">All students</option>'
  + Object.entries(AUDIENCES).filter(([k]) => k !== 'all').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')
  + '<option value="removed">Removed</option><option value="declined">Declined requests</option>';
$('#student-link').href = $('#student-link').textContent = STUDENT_URL;

async function loadStudents() {
  try { state.students = await api.listStudents(); } catch (err) { toast(errorText(err), 'bad'); }
  state.students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const active = state.students.filter(s => s.role === 'student').length;
  $('#student-count').textContent = active || '';
  drawStudents();
  drawReach();
  drawChatList();
  drawHomeworkTargets();
  drawHomeworkAdmin();
  if (pay.month) drawPaid();
}
function filteredStudents() {
  const q = $('#student-search').value.trim().toLowerCase();
  const f = $('#student-filter').value;
  return state.students.filter(s => (f === 'removed' || f === 'declined' ? s.role === f : s.role === 'student' && noticeIsFor({ audience: f }, s))
    && (!q || [s.name, s.email, s.phone, s.guardian].some(v => (v || '').toLowerCase().includes(q))));
}
function drawStudents() {
  const list = filteredStudents();
  const active = state.students.filter(s => s.role === 'student').length;
  $('#students-title').textContent = `${active} student${active === 1 ? '' : 's'}`;
  $('#students-empty').hidden = state.students.length > 0;
  $('#student-rows').innerHTML = list.map(s => `<tr>
    <td data-th="Name"><b>${esc(s.name)}</b>${s.guardian ? `<small>Parent: ${esc(s.guardian)}</small>` : ''}</td>
    <td data-th="Classes">${(s.disciplines || []).map(d => `<span class="tag">${DISCIPLINES[d] || esc(d)}</span>`).join(' ')}</td>
    <td data-th="Dojo">${DOJOS[s.dojo] || '—'}</td>
    <td data-th="Belt">${s.role === 'student'
      ? `<select class="belt-select" data-belt="${esc(s.id)}" aria-label="Belt for ${esc(s.name)}">${Object.entries(GRADES).map(([k, v]) => `<option value="${k}"${k === (s.grade || 'none') ? ' selected' : ''}>${v}</option>`).join('')}</select>`
      : GRADES[s.grade] || '—'}</td>
    <td data-th="Contact"><a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.phone ? `<small><a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></small>` : ''}</td>
    <td data-th="Joined">${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB') : '—'}</td>
    <td>${s.role !== 'student'
      ? `<button class="linkish" data-restore="${esc(s.id)}">${s.role === 'declined' ? 'Accept' : 'Restore'}</button>`
      : `<button class="linkish danger" data-remove="${esc(s.id)}">Remove</button>`}</td>
  </tr>`).join('') || (state.students.length ? '<tr><td colspan="7" class="muted">No students match.</td></tr>' : '');
}
$('#student-search').addEventListener('input', drawStudents);
$('#student-filter').addEventListener('change', drawStudents);
$('#refresh-students').addEventListener('click', e => busy(e.currentTarget, loadStudents));
// Sensei changes a student's belt (e.g. after a grading). The student sees it straight away.
$('#student-rows').addEventListener('change', async e => {
  const sel = e.target.closest('[data-belt]');
  if (!sel) return;
  const s = state.students.find(x => x.id === sel.dataset.belt);
  const before = s.grade || 'none';
  if (!confirm(`Change ${s.name}’s belt from ${GRADES[before]} to ${GRADES[sel.value]}?`)) { sel.value = before; return; }
  sel.disabled = true;
  try {
    await api.saveProfile(s.id, { grade: sel.value, gradeChangedAt: Date.now() });
    s.grade = sel.value;
    toast(`${s.name} is now ${GRADES[sel.value]}`);
    drawReach(); drawHomeworkAdmin();
    if (state.open === s.id) openChat(s.id);
  } catch (err) { sel.value = before; toast(errorText(err), 'bad'); }
  sel.disabled = false;
});
$('#student-rows').addEventListener('click', async e => {
  const rm = e.target.closest('[data-remove]');
  const rs = e.target.closest('[data-restore]');
  const id = (rm || rs || {}).dataset;
  if (!id) return;
  const uid = id.remove || id.restore;
  const s = state.students.find(x => x.id === uid);
  if (rm && !confirm(`Remove ${s.name}? They will no longer see notices or messages in the app.`)) return;
  const was = s.role;
  try {
    await api.saveProfile(uid, { role: rm ? 'removed' : 'student' });
    s.role = rm ? 'removed' : 'student';
    toast(rm ? s.name + ' removed' : s.name + (was === 'declined' ? ' accepted' : ' restored'));
    loadStudents();
  } catch (err) { toast(errorText(err), 'bad'); }
});
$('#export-students').addEventListener('click', () => {
  const cols = ['name', 'guardian', 'email', 'phone', 'disciplines', 'dojo', 'belt', 'joined'];
  const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = filteredStudents().map(s => [s.name, s.guardian, s.email, s.phone, (s.disciplines || []).map(d => DISCIPLINES[d]).join('; '),
    DOJOS[s.dojo], GRADES[s.grade], s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : ''].map(cell).join(','));
  download('emptyhands-students.csv', [cols.join(','), ...rows].join('\r\n'), 'text/csv');
});

// ---- calendar editor ----
async function loadYear(year) {
  const saved = await api.getCalendar(year).catch(() => null);
  const cal = saved || await loadCalendar(api, year);
  ed.year = +year;
  ed.days = (cal && cal.days) || {};
  ed.timings = (cal && cal.timings) || ed.timings;
  ed.pdf = (cal && cal.pdf) || '';
  ed.published = !!cal; // the bundled 2026 dates count: students already see them
  ed.dirty = false;
  drawEditor();
}
function setDirty() { ed.dirty = true; drawEditor(); }

async function drawEditor() {
  $('#ed-year').textContent = ed.year;
  const years = await calendarYears(api);
  $('#ed-year-select').innerHTML = [...new Set([...years, ed.year])].sort().map(y => `<option${y === ed.year ? ' selected' : ''}>${y}</option>`).join('');
  const status = ed.dirty ? ['Unpublished changes', 'warn'] : ed.published ? ['Published', 'ok'] : ['Draft — not published', 'warn'];
  $('#ed-status').textContent = status[0];
  $('#ed-status').className = 'pill ' + status[1];
  $('#publish').disabled = !ed.dirty && ed.published;
  const counts = {};
  Object.values(ed.days).forEach(d => { if (d.type) counts[d.type] = (counts[d.type] || 0) + 1; });
  $('#ed-legend').innerHTML = legendHTML(counts);
  renderYear($('#ed-grid'), ed.year, { days: ed.days, editable: true, onDay: editDay });
  if (document.activeElement !== $('#ed-timings')) $('#ed-timings').value = ed.timings.join('\n');
  if (document.activeElement !== $('#ed-pdf')) $('#ed-pdf').value = ed.pdf;
}

function editDay(key) {
  const brush = $('[name=brush]:checked').value;
  const entry = { ...(ed.days[key] || {}) };
  if (brush === 'note') {
    $('#note-when').textContent = longDate(key);
    $('#form-note').note.value = entry.note || '';
    $('#note-dialog').dataset.key = key;
    $('#note-dialog').showModal();
    return;
  }
  if (brush === 'clear') delete ed.days[key];
  else {
    if (entry.type === brush) delete entry.type; else entry.type = brush;
    if (entry.type || entry.note) ed.days[key] = entry; else delete ed.days[key];
  }
  setDirty();
}
$('#note-dialog').addEventListener('close', () => {
  const dlg = $('#note-dialog');
  if (dlg.returnValue !== 'save') return;
  const key = dlg.dataset.key;
  const note = $('#form-note').note.value.trim();
  const entry = { ...(ed.days[key] || {}) };
  if (note) entry.note = note; else delete entry.note;
  if (entry.type || entry.note) ed.days[key] = entry; else delete ed.days[key];
  setDirty();
});

$('#ed-timings').addEventListener('input', e => { ed.timings = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); ed.dirty = true; drawStatusOnly(); });
$('#ed-pdf').addEventListener('input', e => { ed.pdf = e.target.value.trim(); ed.dirty = true; drawStatusOnly(); });
function drawStatusOnly() { $('#ed-status').textContent = 'Unpublished changes'; $('#ed-status').className = 'pill warn'; $('#publish').disabled = false; }

$('#ed-year-select').addEventListener('change', async e => {
  if (ed.dirty && !confirm('Discard your unpublished changes to ' + ed.year + '?')) { e.target.value = ed.year; return; }
  await loadYear(+e.target.value);
});
$('#publish').addEventListener('click', e => busy(e.currentTarget, async () => {
  try {
    await api.saveCalendar(ed.year, { days: ed.days, timings: ed.timings, pdf: ed.pdf });
    ed.dirty = false; ed.published = true;
    drawEditor();
    toast(`${ed.year} calendar published — students can see it now`);
  } catch (err) { toast(errorText(err), 'bad'); }
}));

function thursdays(year) {
  const out = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) if (d.getDay() === 4) out.push(keyOf(d));
  return out;
}
$('#fill-thursdays').addEventListener('click', () => {
  thursdays(ed.year).forEach(k => { if (!ed.days[k] || !ed.days[k].type) ed.days[k] = { ...(ed.days[k] || {}), type: 'training' }; });
  setDirty();
});
$('#clear-all').addEventListener('click', () => {
  if (!confirm(`Clear every date in ${ed.year}? (Nothing changes for students until you publish.)`)) return;
  ed.days = {};
  setDirty();
});
$('#new-year').addEventListener('click', () => {
  const f = $('#form-year');
  f.year.value = Math.max(ed.year, new Date().getFullYear()) + 1;
  $('#year-dialog').showModal();
});
$('#year-dialog').addEventListener('close', async () => {
  const dlg = $('#year-dialog');
  const f = $('#form-year');
  if (dlg.returnValue !== 'create') return;
  const year = +f.year.value;
  if (!(year >= 2020 && year <= 2100)) return toast('Please enter a valid year', 'bad');
  if (ed.dirty && !confirm('Discard your unpublished changes to ' + ed.year + '?')) return;
  const existing = await api.getCalendar(year).catch(() => null);
  if (existing) { toast(year + ' already exists — opening it'); return loadYear(year); }
  const timings = f.copyTimings.checked ? ed.timings : [];
  ed.year = year;
  ed.days = f.thursdays.checked ? Object.fromEntries(thursdays(year).map(k => [k, { type: 'training' }])) : {};
  ed.timings = timings;
  ed.pdf = '';
  ed.published = false;
  ed.dirty = true;
  drawEditor();
  toast(`Draft ${year} calendar created — mark closures and events, then Publish`);
});
addEventListener('beforeunload', e => { if (ed.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---- coaches ----
async function drawCoaches() {
  $('#owners').innerHTML = OWNER_EMAILS.map(e => `<li>${esc(e)}</li>`).join('');
  const list = await api.getCoaches().catch(() => []);
  $('#coach-list').innerHTML = list.length
    ? list.map(e => `<li>${esc(e)} <button type="button" class="linkish danger" data-uncoach="${esc(e)}">Remove</button></li>`).join('')
    : '<li class="muted">No extra Sensei yet.</li>';
}
$('#form-coaches').addEventListener('submit', async e => {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Please enter a valid email', 'bad');
  try {
    const list = await api.getCoaches();
    if (!list.includes(email)) await api.saveCoaches([...list, email]);
    e.target.email.value = '';
    toast(email + ' can now create a Sensei account');
    drawCoaches();
  } catch (err) { toast(errorText(err), 'bad'); }
});
$('#coach-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-uncoach]');
  if (!b || !confirm('Remove ' + b.dataset.uncoach + ' as a Sensei?')) return;
  try { await api.saveCoaches((await api.getCoaches()).filter(x => x !== b.dataset.uncoach)); drawCoaches(); } catch (err) { toast(errorText(err), 'bad'); }
});

// ---- start ----
(async () => {
  $('#demo-banner').hidden = !DEMO;
  try { api = await backend(); } catch (err) {
    $('#loading').innerHTML = '<p class="muted">Couldn’t connect. Check your internet connection and reload.</p>';
    console.error(err);
    return;
  }
  api.onAuth(onAuth);
})();
