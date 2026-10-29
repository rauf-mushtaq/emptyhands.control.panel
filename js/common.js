// Shared by the student app and the coach panel: labels, calendar rendering, helpers.
import { CALENDAR_2026 } from './calendar-data.js';

export const TYPES = {
  training: { label: 'Dojo training', note: 'Thursday classes at the Ilford dojo' },
  closed: { label: 'Dojo closed', note: 'No classes on this date' },
  blackbelt: { label: 'Black belt class', note: 'Epping dojo (invite only)' },
  grading: { label: 'Grading & workshop', note: 'Grading or workshop date' },
};

export const DISCIPLINES = { karate: 'Karate', taichi: 'Tai Chi', yoga: 'Yoga' };
export const DOJOS = { ilford: 'Ilford', epping: 'Epping (invite only)', both: 'Both dojos' };
// Karate belts, lowest first. 'dan' (black belt) is what black-belt dates and notices check for.
export const GRADES = {
  none: 'No belt',
  red: 'Red belt',
  orange: 'Orange belt',
  yellow: 'Yellow belt',
  green: 'Green belt',
  purple: 'Purple belt',
  purple1: 'Purple 1 stripe belt',
  brown: 'Brown belt',
  brown1: 'Brown 1 stripe belt',
  brown2: 'Brown 2 stripe belt',
  dan: 'Black belt',
};
// Medals Sensei can award, and some ready-made reasons (Sensei can write their own).
export const MEDALS = {
  gold: { label: 'Gold medal', icon: '🥇' },
  silver: { label: 'Silver medal', icon: '🥈' },
  bronze: { label: 'Bronze medal', icon: '🥉' },
  trophy: { label: 'Trophy', icon: '🏆' },
  star: { label: 'Star', icon: '⭐' },
};
export const MEDAL_REASONS = ['Perfect attendance', 'Most improved', 'Best kata', 'Great effort', 'Kumite champion', 'Fantastic grading', 'Helping others', 'Great attitude'];
export function medalHTML(a, del) {
  const m = MEDALS[a.medal] || MEDALS.star;
  return `<article class="medal medal--${esc(a.medal in MEDALS ? a.medal : 'star')}">
    <div class="medal-icon" aria-hidden="true">${m.icon}</div>
    <div class="medal-body">
      <h3>${esc(a.title)}</h3>
      ${a.note ? `<p>${esc(a.note).replace(/\n/g, '<br>')}</p>` : ''}
      <footer>${esc(m.label)} · ${a.studentName && del ? esc(a.studentName) + ' · ' : ''}${esc(a.from || 'Sensei')} · ${a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}${del ? ` · <button type="button" class="linkish danger" data-delaward="${esc(a.id)}">Remove</button>` : ''}</footer>
    </div>
  </article>`;
}

// The belts on the student licence, in order, as on EmptyHands' paper licence.
export const LICENCE_BELTS = [
  { grade: 'none', belt: 'White', rank: '10th Kyu', level: 'Beginner', bg: '#ffffff', fg: '#1c1a16' },
  { grade: 'red', belt: 'Red', rank: '9th Kyu', level: 'Beginner', bg: '#e31b1b', fg: '#ffffff' },
  { grade: 'orange', belt: 'Orange', rank: '8th Kyu', level: 'Beginner', bg: '#f39200', fg: '#ffffff' },
  { grade: 'yellow', belt: 'Yellow', rank: '7th Kyu', level: 'Intermediate', bg: '#ffee00', fg: '#1c1a16' },
  { grade: 'green', belt: 'Green', rank: '6th Kyu', level: 'Intermediate', bg: '#0a7d1e', fg: '#ffffff' },
  { grade: 'purple', belt: 'Purple', rank: '5th Kyu', level: 'Intermediate', bg: '#7a1a86', fg: '#ffffff' },
  { grade: 'purple1', belt: 'Purple/stripe or Blue', rank: '4th Kyu', level: 'Intermediate', bg: '#7a1a86', fg: '#ffffff' },
  { grade: 'brown', belt: 'Brown', rank: '3rd Kyu', level: 'Advance', bg: '#7a5200', fg: '#ffffff' },
  { grade: 'brown1', belt: 'Brown with stripe', rank: '2nd Kyu', level: 'Advance', bg: '#7a5200', fg: '#ffffff' },
  { grade: 'brown2', belt: 'Brown with two stripes', rank: '1st Kyu', level: 'Advance', bg: '#7a5200', fg: '#ffffff' },
  { grade: 'dan', belt: '1st Degree Black', rank: '1st Dan', level: 'Professional', bg: '#000000', fg: '#ffffff' },
];
export const LICENCE_RESULTS = ['', 'Pass', 'Merit', 'Distinction'];
export const OATH = '“I promise to uphold the true spirit of KaraTe and never to use the skills that I am taught against any person(s), except for the defence of myself, family, or friends in the instance of extreme danger or unprovoked attack, or in the support of law and order. Safety will be always my first priority, both for myself and fellow KaraTe-ka. I will endeavour to learn & follow the guidelines of the Dojo Kun & Niju Kun.”';

// The student licence, laid out like the paper one. `l` is licences/{uid}, `p` the student's
// profile. With `edit`, every field is an input (Sensei panel); otherwise it's the student's copy.
export function licenceHTML(l, p, { edit = false, logo = 'assets/img/logo.png' } = {}) {
  l = l || {};
  const rec = l.record || {};
  const field = (name, value, opts = {}) => edit
    ? `<input name="${name}" value="${esc(value || '')}" maxlength="${opts.max || 160}"${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''} aria-label="${esc(opts.label || name)}">`
    : esc(value || '');
  const row = (label, html) => `<tr><th scope="row">${label}</th><td>${html}</td></tr>`;
  const details = [
    row('Student Name', esc(p.name || '')),
    row('Address', field('address', l.address, { max: 200, label: 'Address' })),
    row('Email', esc(p.email || '')),
    row('Phone', esc(p.phone || '')),
    row('Membership Number', field('membershipNo', l.membershipNo, { max: 40, ph: 'e.g. EH0002014', label: 'Membership number' })),
    row('Start Date', field('startDate', l.startDate, { max: 40, ph: 'e.g. 2014', label: 'Start date' })),
    row('Membership Renewal', field('renewal', l.renewal, { max: 40, ph: 'e.g. Aug 2026', label: 'Membership renewal' })),
    row('Membership Status', edit
      ? `<select name="status" aria-label="Membership status">${['Active', 'Inactive', 'Suspended'].map(o => `<option${(l.status || 'Active') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
      : esc(l.status || 'Active')),
  ].join('');
  const belts = LICENCE_BELTS.map(b => {
    const r = rec[b.grade] || {};
    const cell = (k, html) => `<td class="lic-${k}">${html}</td>`;
    const result = edit
      ? `<select name="rec.${b.grade}.result" aria-label="${esc(b.belt)} result">${LICENCE_RESULTS.map(o => `<option${(r.result || '') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
      : esc(r.result || '');
    return `<tr style="--belt:${b.bg};--belt-ink:${b.fg}"${!edit && p.grade === b.grade ? ' class="is-current"' : ''}>
      <td class="lic-belt">${esc(b.belt)}</td><td class="lic-belt">${esc(b.rank).replace(/(\d)(st|nd|rd|th)/, '$1<sup>$2</sup>')}</td><td class="lic-belt">${esc(b.level)}</td>
      ${cell('date', field(`rec.${b.grade}.date`, r.date, { max: 20, ph: 'dd/mm/yyyy', label: b.belt + ' grading date' }))}
      ${cell('result', result)}
      ${cell('examiners', field(`rec.${b.grade}.examiners`, r.examiners, { max: 80, ph: 'e.g. AM, JP', label: b.belt + ' examiners' }))}</tr>`;
  }).join('');
  return `<article class="licence${edit ? ' licence--edit' : ''}">
    <header class="lic-head"><img src="${logo}" alt="EmptyHands KaraTe School"><span>Develop – Empower – Inspire</span></header>
    <h2 class="lic-title">Student Licence – <i>Original Copy</i></h2>
    <table class="lic-details"><tbody>${details}</tbody></table>
    <h3>Oath</h3><p class="lic-oath">${esc(OATH)}</p>
    <h3>Record</h3>
    <div class="lic-table-wrap"><table class="lic-record">
      <thead><tr><th>Belt</th><th>Rank</th><th>Level</th><th>Grading Date</th><th>Results</th><th>Grading Examiner(s)</th></tr></thead>
      <tbody>${belts}</tbody></table></div>
    <p class="lic-auth">Records authenticated by ${field('authenticatedBy', l.authenticatedBy || (edit ? '' : 'Azeem Mushtaq (Sensei), Head Teacher, EmptyHands KaraTe School'), { max: 120, ph: 'e.g. Azeem Mushtaq (Sensei), Head Teacher', label: 'Authenticated by' })}</p>
    <footer class="lic-foot">Copyright © EmptyHands ${new Date().getFullYear()}. All rights reserved.</footer>
  </article>`;
}

// Reads the Sensei panel's licence form back into a licences/{uid} document.
export function licenceFromForm(form) {
  const d = { record: {} };
  for (const el of form.querySelectorAll('[name]')) {
    const v = el.value.trim();
    const m = el.name.match(/^rec\.(\w+)\.(date|result|examiners)$/);
    if (m) { if (v) (d.record[m[1]] ||= {})[m[2]] = v; } else d[el.name] = v;
  }
  return d;
}

export const AUDIENCES = {
  all: 'Everyone',
  karate: 'Karate students',
  taichi: 'Tai Chi students',
  yoga: 'Yoga students',
  ilford: 'Ilford dojo students',
  epping: 'Epping dojo students (invite only)',
  blackbelt: 'Black belts',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const pad = n => String(n).padStart(2, '0');
export const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayKey = () => keyOf(new Date());
export const longDate = key => dateOf(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = key => dateOf(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function daysUntil(key) {
  return Math.round((dateOf(key) - dateOf(todayKey())) / 864e5);
}
export function whenText(key) {
  const n = daysUntil(key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return n === -1 ? 'Yesterday' : -n + ' days ago';
  if (n < 14) return 'In ' + n + ' days';
  return 'In ' + Math.round(n / 7) + ' weeks';
}
export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Payments ----
// Default fee list (from the website's Fees page). Sensei can change it in the coach panel.
// `level` links a monthly fee or grading to belts, so the student app can highlight theirs.
export const DEFAULT_FEES = [
  { id: 'membership', group: 'karate', name: 'Annual membership', price: 40, per: 'year', note: 'Dojo licence and insurance' },
  { id: 'starter', group: 'karate', name: 'Karate per lesson', price: 10, per: 'lesson', note: 'Pay as you go' },
  { id: 'k-beg', group: 'karate', name: 'Karate monthly — Beginner', price: 30, per: 'month', note: 'White to Orange belt', level: 'beginner' },
  { id: 'k-int', group: 'karate', name: 'Karate monthly — Intermediate', price: 35, per: 'month', note: 'Yellow to Green belt', level: 'intermediate' },
  { id: 'k-adv', group: 'karate', name: 'Karate monthly — Advanced', price: 40, per: 'month', note: 'Purple belt', level: 'advanced' },
  { id: 'g-beg', group: 'grading', name: 'Grading — Beginner', price: 25, per: '', note: 'White to Orange belt', level: 'beginner' },
  { id: 'g-int', group: 'grading', name: 'Grading — Intermediate', price: 30, per: '', note: 'Yellow to Green belt', level: 'intermediate' },
  { id: 'g-adv', group: 'grading', name: 'Grading — Advanced', price: 35, per: '', note: 'Purple to Brown belt', level: 'advanced' },
  { id: 'g-adv2', group: 'grading', name: 'Grading — Advanced II', price: 45, per: '', note: 'Brown 2 stripe and above', level: 'advanced2' },
  { id: 'y-drop', group: 'yoga', name: 'Yoga drop-in', price: 10, per: 'class', note: '' },
  { id: 'y-month', group: 'yoga', name: 'Yoga monthly', price: 30, per: 'month', note: '' },
  { id: 't-drop', group: 'taichi', name: 'Tai Chi drop-in', price: 10, per: 'class', note: 'Advance booking required' },
  { id: 't-month', group: 'taichi', name: 'Tai Chi monthly', price: 30, per: 'month', note: '' },
];
export const FEE_GROUPS = { karate: 'Karate', grading: 'Gradings', yoga: 'Yoga', taichi: 'Tai Chi', other: 'Other' };
export const FEE_LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', advanced2: 'Advanced II' };

// Belt → monthly fee level. Brown belt and above pay a monthly fee agreed with Sensei
// ('application'), so the student app shows "On application" instead of a price.
export function feeLevel(grade) {
  if (['yellow', 'green'].includes(grade)) return 'intermediate';
  if (['purple', 'purple1'].includes(grade)) return 'advanced';
  if (['brown', 'brown1', 'brown2', 'dan'].includes(grade)) return 'application';
  return 'beginner';
}
export const money = n => '£' + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);

// A PayPal "Buy now" link (PayPal Payments Standard). `paypal` is the business account's email
// or merchant ID; the student's name goes in the item name so Sensei can see who paid.
// With `track` ({ uid, notifyUrl }), PayPal also tells our paypalIpn function about the payment,
// which records it for that student (custom = uid|fee id|month). `back` is where PayPal returns
// people afterwards. landing_page=billing opens PayPal on its card form, so no PayPal account is needed.
export function paypalLink(paypal, fee, who, track, back) {
  const q = new URLSearchParams({
    cmd: '_xclick', business: paypal, item_name: fee.name + (who ? ' — ' + who : ''),
    amount: Number(fee.price).toFixed(2), currency_code: 'GBP', no_shipping: '1', no_note: '1',
    landing_page: 'billing', solution_type: 'Sole',
  });
  if (back) { q.set('return', back + '#pay'); q.set('cancel_return', back + '#pay'); q.set('rm', '1'); q.set('cbt', 'Back to EmptyHands'); }
  if (track) { q.set('custom', [track.uid, fee.id, monthKey()].join('|')); q.set('notify_url', track.notifyUrl); }
  return 'https://www.paypal.com/cgi-bin/webscr?' + q;
}

// Fee tracking is by calendar month, e.g. '2026-10'.
export const monthKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
export const monthName = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
export const PAY_METHODS = { paypal: 'PayPal', cash: 'Cash', bank: 'Bank transfer', other: 'Other' };
// A payment counts towards the monthly fee if it's for a per-month fee, or marked by Sensei as monthly.
export const isMonthly = pmt => pmt.kind === 'monthly';
// The monthly Karate fee for a belt, for Sensei's "Mark paid" default.
export function monthlyFeeFor(fees, p) {
  const lvl = feeLevel(p.grade);
  if (lvl === 'application') return null;
  return fees.find(f => f.per === 'month' && f.level === lvl && (p.disciplines || []).includes(f.group))
    || fees.find(f => f.per === 'month' && (p.disciplines || []).includes(f.group))
    || fees.find(f => f.per === 'month');
}

// The notice/homework groups a student belongs to. Must match myAudiences() in firestore.rules.
export function myAudiences(p) {
  const d = p.dojo || '';
  return ['all', ...(p.disciplines || []),
    ...(d === 'ilford' || d === 'both' ? ['ilford'] : []), ...(d === 'epping' || d === 'both' ? ['epping'] : []),
    ...(p.grade === 'dan' ? ['blackbelt'] : [])];
}

// Who a homework item is for: one student, or a group like a notice.
export function homeworkIsFor(h, uid, p) {
  return h.student ? h.student === uid : noticeIsFor(h, p);
}

// Which calendar entries matter to this student.
export function isRelevant(type, profile) {
  if (!profile) return true;
  if (type === 'blackbelt') return profile.grade === 'dan';
  if (type === 'grading') return (profile.disciplines || []).includes('karate');
  return true;
}

export function noticeIsFor(n, p) {
  const a = n.audience || 'all';
  if (a === 'all' || !p) return true;
  if (DISCIPLINES[a]) return (p.disciplines || []).includes(a);
  if (a === 'ilford' || a === 'epping') return p.dojo === a || p.dojo === 'both';
  if (a === 'blackbelt') return p.grade === 'dan';
  return true;
}

// The published calendar for a year, falling back to the bundled 2026 calendar.
export async function loadCalendar(api, year) {
  let cal = null;
  try { cal = await api.getCalendar(year); } catch (e) { console.warn(e); }
  if (!cal && +year === 2026) cal = structuredClone(CALENDAR_2026);
  return cal;
}
export async function calendarYears(api) {
  let years = [];
  try { years = await api.listCalendarYears(); } catch (e) { console.warn(e); }
  return [...new Set([2026, ...years])].sort((a, b) => a - b);
}

// Renders the 12-month grid. opts: { days, profile, onlyMine, editable, onDay(key, button) }
export function renderYear(el, year, opts = {}) {
  const days = opts.days || {};
  const today = todayKey();
  el.innerHTML = MONTHS.map((name, m) => {
    const first = new Date(year, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(year, m + 1, 0).getDate();
    let cells = '<span class="cal-blank"></span>'.repeat(lead);
    for (let d = 1; d <= count; d++) {
      const key = year + '-' + pad(m + 1) + '-' + pad(d);
      const entry = days[key];
      const cls = ['cal-day'];
      let label = longDate(key);
      if (entry && entry.type) {
        cls.push('t-' + entry.type);
        label += ' — ' + TYPES[entry.type].label;
        if (opts.profile && !isRelevant(entry.type, opts.profile)) cls.push(opts.onlyMine ? 'is-hidden-type' : 'is-faded');
      }
      if (entry && entry.note) { cls.push('has-note'); label += ' — ' + entry.note; }
      // Attendance marks: 'here' (✓), 'away' (✗) or 'reg' (a register was taken).
      const mark = opts.marks && opts.marks[key];
      if (mark) { cls.push('att-' + mark); label += mark === 'here' ? ' — you were there' : mark === 'away' ? ' — not marked present' : ' — register taken'; }
      if (key === today) cls.push('is-today');
      if (key < today) cls.push('is-past');
      const interactive = opts.editable || mark || (entry && (entry.type || entry.note));
      cells += interactive
        ? `<button type="button" class="${cls.join(' ')}" data-key="${key}" aria-label="${esc(label)}">${d}</button>`
        : `<span class="${cls.join(' ')}">${d}</span>`;
    }
    return `<section class="cal-month" id="m-${year}-${m + 1}"><h3>${name}</h3>
      <div class="cal-grid">${DOW.map(w => `<span class="cal-dow">${w[0]}<span class="sr-only">${w.slice(1)}</span></span>`).join('')}${cells}</div></section>`;
  }).join('');
  if (opts.onDay) el.onclick = e => { const b = e.target.closest('button.cal-day'); if (b) opts.onDay(b.dataset.key, b); };
}

// One chat message in the EmptyHands menu. Sensei's messages are bold; `mine` puts it on the
// viewer's side; `del` adds a delete button (for moderation or the author's own messages).
// The sent message being edited, and the draft so far (kept while the feed redraws).
export const editing = { id: null, draft: '' };

export function messageHTML(m, mine, del, edit) {
  const who = m.from === 'coach' ? esc(m.author || 'Sensei') + ' · Sensei' : esc(m.author || 'Student');
  const open = edit && editing.id === m.id;
  const tools = [
    edit && !open ? `<button type="button" class="linkish" data-editmsg="${esc(m.id)}">Edit</button>` : '',
    del ? `<button type="button" class="linkish danger" data-delmsg="${esc(m.id)}">Delete</button>` : '',
  ].filter(Boolean).join(' · ');
  const body = open
    ? `<form class="msg-edit" data-editform="${esc(m.id)}">
        <textarea name="text" rows="3" maxlength="2000" required aria-label="Edit your message">${esc(editing.draft)}</textarea>
        <div class="msg-edit-actions"><button type="button" class="btn btn--ghost btn--sm" data-editcancel>Cancel</button><button class="btn btn--seal btn--sm">Save</button></div>
      </form>`
    : `<div class="msg-text">${esc(m.text).replace(/\n/g, '<br>')}</div>`;
  return `<div class="msg msg--${m.from === 'coach' ? 'coach' : 'student'}${mine ? ' msg--mine' : ''}${open ? ' is-editing' : ''}">
    <div class="msg-meta">${who} · ${timeAgo(m.createdAt)}${'editedAt' in m ? ' · edited' : ''}${tools ? ' · ' + tools : ''}</div>
    ${body}</div>`;
}

// Edit / Cancel / Save on a feed of messages. find(id) gives the message, save(id, text) stores
// the new text, redraw() redraws the feed and fail(err) reports an error.
export function wireEdits(feed, { find, save, redraw, fail }) {
  feed.addEventListener('click', e => {
    const b = e.target.closest('[data-editmsg]');
    if (b) {
      const m = find(b.dataset.editmsg);
      if (!m) return;
      editing.id = m.id;
      editing.draft = m.text;
      redraw();
      const t = $('.msg-edit textarea', feed);
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.scrollIntoView({ block: 'nearest' }); }
    } else if (e.target.closest('[data-editcancel]')) {
      editing.id = null;
      redraw();
    }
  });
  feed.addEventListener('input', e => { if (e.target.closest('.msg-edit')) editing.draft = e.target.value; });
  feed.addEventListener('submit', async e => {
    const form = e.target.closest('[data-editform]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.editform;
    const text = form.text.value.trim();
    if (!text) return;
    const m = find(id);
    if (m && text === m.text) { editing.id = null; redraw(); return; }
    await busy(form.querySelector('button:not([type=button])'), async () => {
      try { await save(id, text); editing.id = null; redraw(); } catch (err) { fail(err); }
    });
  });
}

export function legendHTML(counts) {
  return Object.entries(TYPES).map(([t, v]) =>
    `<span class="legend-item"><span class="swatch t-${t}"></span>${v.label}${counts ? ` <small>${counts[t] || 0}</small>` : ''}</span>`).join('');
}

// Upcoming dated entries, soonest first.
export function upcoming(days, profile, limit = 8) {
  const today = todayKey();
  return Object.entries(days)
    .filter(([k, v]) => k >= today && (v.type || v.note) && (!v.type || isRelevant(v.type, profile)))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([key, v]) => ({ key, ...v }));
}

export function icsFor(year, days, profile) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const fold = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ev = Object.entries(days)
    .filter(([k, v]) => k.startsWith(year + '-') && v.type && isRelevant(v.type, profile))
    .map(([k, v]) => {
      const start = k.replace(/-/g, '');
      const next = dateOf(k); next.setDate(next.getDate() + 1);
      return ['BEGIN:VEVENT', `UID:eh-${k}-${v.type}@emptyhands`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${keyOf(next).replace(/-/g, '')}`, `SUMMARY:${fold('EmptyHands: ' + TYPES[v.type].label)}`,
        `DESCRIPTION:${fold(v.note || TYPES[v.type].note)}`, 'END:VEVENT'].join('\r\n');
    });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EmptyHands//Dojo Calendar//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:EmptyHands ${year}`, ...ev, 'END:VCALENDAR'].join('\r\n');
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toast(msg, kind = '') {
  let box = $('#toasts');
  if (!box) { box = Object.assign(document.createElement('div'), { id: 'toasts' }); box.setAttribute('role', 'status'); document.body.append(box); }
  const t = Object.assign(document.createElement('div'), { className: 'toast ' + kind, textContent: msg });
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

// Busy state for a submit button while an async action runs.
export async function busy(btn, fn) {
  const text = btn.textContent;
  btn.disabled = true; btn.classList.add('is-busy');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('is-busy'); btn.textContent = text; }
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }
}
