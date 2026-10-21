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
  { id: 'starter', group: 'karate', name: 'New starter lesson', price: 10, per: 'lesson', note: 'Pay-as-you-go for your first few weeks' },
  { id: 'k-beg', group: 'karate', name: 'Karate monthly — Beginner', price: 30, per: 'month', note: 'White to Orange belt', level: 'beginner' },
  { id: 'k-int', group: 'karate', name: 'Karate monthly — Intermediate', price: 35, per: 'month', note: 'Yellow to Green belt', level: 'intermediate' },
  { id: 'k-adv', group: 'karate', name: 'Karate monthly — Advanced', price: 40, per: 'month', note: 'Purple to Brown belt', level: 'advanced' },
  { id: 'k-advx', group: 'karate', name: 'Karate monthly — Advanced (extended)', price: 50, per: 'month', note: 'Purple to Brown belt, 6:30pm – 9pm', level: 'advanced' },
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

// Belt → fee level, for highlighting a student's monthly fee and grading.
export function feeLevel(grade) {
  if (['yellow', 'green'].includes(grade)) return 'intermediate';
  if (['purple', 'purple1', 'brown', 'brown1'].includes(grade)) return 'advanced';
  if (['brown2', 'dan'].includes(grade)) return 'advanced2';
  return 'beginner';
}
export const money = n => '£' + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);

// A PayPal "Buy now" link (PayPal Payments Standard). `paypal` is the business account's email
// or merchant ID; the student's name goes in the item name so Sensei can see who paid.
// With `track` ({ uid, notifyUrl }), PayPal also tells our paypalIpn function about the payment,
// which records it for that student (custom = uid|fee id|month).
export function paypalLink(paypal, fee, who, track) {
  const q = new URLSearchParams({
    cmd: '_xclick', business: paypal, item_name: fee.name + (who ? ' — ' + who : ''),
    amount: Number(fee.price).toFixed(2), currency_code: 'GBP', no_shipping: '1',
  });
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
  return fees.find(f => f.per === 'month' && f.level === lvl && (p.disciplines || []).includes(f.group))
    || fees.find(f => f.per === 'month' && (p.disciplines || []).includes(f.group))
    || fees.find(f => f.per === 'month');
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
      if (key === today) cls.push('is-today');
      if (key < today) cls.push('is-past');
      const interactive = opts.editable || (entry && (entry.type || entry.note));
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
export function messageHTML(m, mine, del) {
  const who = m.from === 'coach' ? esc(m.author || 'Sensei') + ' · Sensei' : esc(m.author || 'Student');
  return `<div class="msg msg--${m.from === 'coach' ? 'coach' : 'student'}${mine ? ' msg--mine' : ''}">
    <div class="msg-meta">${who} · ${timeAgo(m.createdAt)}${del ? ` · <button type="button" class="linkish danger" data-delmsg="${esc(m.id)}">Delete</button>` : ''}</div>
    <div class="msg-text">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
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
