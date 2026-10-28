// Push notifications to students (notices, homework, Sensei's messages, group chat posts, class
// and fee reminders) and to Sensei (students' messages, join requests, PayPal payments), on the
// phone apps and, via web push, the website / home-screen apps. Deploy with `firebase deploy --only functions`
// (see README.md). Needs the Firebase Blaze plan.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Same rules as noticeIsFor() in js/common.js.
const DISCIPLINES = ['karate', 'taichi', 'yoga'];
function isFor(audience, p) {
  const a = audience || 'all';
  if (a === 'all') return true;
  if (DISCIPLINES.includes(a)) return (p.disciplines || []).includes(a);
  if (a === 'ilford' || a === 'epping') return p.dojo === a || p.dojo === 'both';
  if (a === 'blackbelt') return p.grade === 'dan';
  return true;
}

const GONE = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];
const OWNER_EMAIL = 'info@emptyhands.co.uk'; // keep in line with OWNERS in firestore.rules
const REGION = 'europe-west2';
const STUDENT_URL = 'https://rauf-mushtaq.github.io/emptyhands.student/';
const COACH_URL = 'https://rauf-mushtaq.github.io/emptyhands.control.panel/';
// How each notification is shown: Android/iPhone apps, and web push for the website / home-screen apps.
const deliver = link => ({
  android: { priority: 'high', notification: { color: '#A8342A', icon: 'ic_stat_notify' } },
  apns: { payload: { aps: { sound: 'default' } } },
  webpush: { headers: { Urgency: 'high' }, notification: { icon: STUDENT_URL + 'home-icon-192.png', badge: STUDENT_URL + 'home-icon-192.png' }, fcmOptions: { link } },
});
const clip = t => (t.length > 180 ? t.slice(0, 177) + '…' : t);

// Sends one notification to [token, docRef] pairs and forgets tokens of uninstalled apps.
async function send(targets, notification, data, link) {
  let sent = 0;
  for (let i = 0; i < targets.length; i += 500) {
    const batch = targets.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch.map(([t]) => t), notification: { ...notification, body: clip(notification.body) }, data: { ...data, link }, ...deliver(link),
    });
    sent += res.successCount;
    await Promise.all(res.responses.map((r, j) => (!r.success && GONE.includes(r.error && r.error.code)
      ? batch[j][1].update({ pushTokens: FieldValue.arrayRemove(batch[j][0]) })
      : null)));
  }
  return sent;
}

// The region must match the Firestore database location chosen in README.md.
const studentTargets = (snap, isTarget) => {
  const targets = [];
  snap.forEach(doc => { if (isTarget(doc.id, doc.data())) (doc.data().pushTokens || []).forEach(t => targets.push([t, doc.ref])); });
  return targets;
};
async function pushToStudents(isTarget, notification, data, view = 'home') {
  const students = await getFirestore().collection('users').where('role', '==', 'student').get();
  return send(studentTargets(students, isTarget), notification, data, STUDENT_URL + '#' + view);
}

// Sensei sent a notice.
exports.pushNotice = onDocumentCreated({ document: 'notifications/{id}', region: 'europe-west2' }, async event => {
  const n = event.data.data();
  await pushToStudents((id, p) => isFor(n.audience, p), { title: n.title, body: n.body }, { noticeId: event.params.id }, 'menu');
});

// Sensei messaged a student privately (also the automatic fee reminders).
exports.pushMessage = onDocumentCreated({ document: 'chats/{uid}/messages/{id}', region: 'europe-west2' }, async event => {
  const m = event.data.data();
  if (m.from === 'student') return pushToCoaches({ title: 'Message from ' + (m.author || 'a student'), body: m.text }, { chat: event.params.uid }, 'menu');
  if (m.from !== 'coach') return;
  const title = m.kind === 'fees' ? 'Fees reminder' : (m.author || 'Sensei') + ' sent you a message';
  await pushToStudents(id => id === event.params.uid, { title, body: m.text }, { chat: event.params.uid }, m.kind === 'fees' ? 'pay' : 'menu');
});

// Sensei set homework.
exports.pushHomework = onDocumentCreated({ document: 'homework/{id}', region: 'europe-west2' }, async event => {
  const h = event.data.data();
  await pushToStudents((id, p) => (h.student ? h.student === id : isFor(h.audience, p)),
    { title: 'New homework from ' + (h.from || 'Sensei'), body: h.title }, { homework: event.params.id }, 'homework');
});

// Sensei posted in the group chat (students' own posts aren't pushed, to keep it quiet).
exports.pushGroup = onDocumentCreated({ document: 'channels/group/messages/{id}', region: 'europe-west2' }, async event => {
  const m = event.data.data();
  if (m.from !== 'coach') return;
  await pushToStudents(() => true, { title: (m.author || 'Sensei') + ' in the group chat', body: m.text }, { channel: 'group' }, 'menu');
});

// Sensei awarded a medal.
const MEDAL_ICONS = { gold: '🥇', silver: '🥈', bronze: '🥉', trophy: '🏆', star: '⭐' };
exports.pushAward = onDocumentCreated({ document: 'awards/{id}', region: 'europe-west2' }, async event => {
  const a = event.data.data();
  await pushToStudents(id => id === a.uid, { title: `${MEDAL_ICONS[a.medal] || '🏅'} You’ve earned a medal!`, body: a.title + (a.note ? ` – ${a.note}` : '') },
    { award: event.params.id }, 'medals');
});

// ---- Notifications for Sensei (coachDevices/{uid} holds each Sensei's devices) ----
async function pushToCoaches(notification, data, view) {
  const db = getFirestore();
  const [devices, list] = await Promise.all([db.collection('coachDevices').get(), db.doc('settings/coaches').get()]);
  const coaches = new Set([OWNER_EMAIL, ...((list.exists && list.data().emails) || [])].map(e => String(e).toLowerCase()));
  const targets = [];
  devices.forEach(doc => { if (coaches.has(String(doc.data().email || '').toLowerCase())) (doc.data().pushTokens || []).forEach(t => targets.push([t, doc.ref])); });
  return send(targets, notification, data, COACH_URL + '#' + view);
}

// Someone asked to join.
exports.pushJoinRequest = onDocumentCreated({ document: 'users/{uid}', region: 'europe-west2' }, async event => {
  const u = event.data.data();
  if (u.role !== 'pending') return;
  await pushToCoaches({ title: 'New join request', body: `${u.name || 'Someone'} would like to join EmptyHands.` }, { request: event.params.uid }, 'requests');
});

// A PayPal payment came in.
exports.pushPayment = onDocumentCreated({ document: 'payments/{id}', region: 'europe-west2' }, async event => {
  const p = event.data.data();
  if (p.method !== 'paypal') return;
  await pushToCoaches({ title: 'Payment received', body: `${p.name || 'A student'} paid £${Number(p.amount || 0).toFixed(2)} by PayPal (${p.feeName || 'fees'}).` }, { payment: event.params.id }, 'payments');
});

// ---- Class reminders: 2 hours and 5 minutes before each class ----
// Thursday classes at Ilford, on the dates the published calendar marks as training.
const CLASSES = [
  { key: 'taichi', name: 'Tai Chi', start: '18:00', time: '6pm' },
  { key: 'karate', name: 'Karate', start: '19:00', time: '7pm' },
  { key: 'yoga', name: 'Yoga', start: '20:00', time: '8pm' },
];
const londonNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute, weekday: parts.weekday };
};
// What the calendar says about today: 'training', 'closed', 'blackbelt', 'grading' or ''.
async function todayType(db, now) {
  const year = now.date.slice(0, 4);
  const cal = await db.doc('calendars/' + year).get();
  // Not published from the Sensei panel yet: the built-in 2026 calendar (as in the apps), else every Thursday.
  const days = cal.exists ? cal.data().days || {} : year === '2026' ? require('./calendar-2026.json').days : null;
  if (!days) return now.weekday === 'Thu' ? 'training' : '';
  return (days[now.date] && days[now.date].type) || '';
}
// Only once per class and reminder, even if the schedule runs twice.
const once = (db, id) => db.doc('sentReminders/' + id).create({ at: Date.now() }).then(() => true, () => false);
const wantsReminders = p => p.classReminders !== false;
const atIlford = p => (p.dojo || 'ilford') !== 'epping';

exports.classReminders = onSchedule({ schedule: '*/5 * * * *', timeZone: 'Europe/London', region: REGION }, async () => {
  const db = getFirestore();
  const now = londonNow();
  const type = await todayType(db, now);
  // On black belt and grading days, a morning reminder.
  if ((type === 'blackbelt' || type === 'grading') && now.minutes >= 9 * 60 && now.minutes < 9 * 60 + 5 && await once(db, `${now.date}_${type}`)) {
    if (type === 'blackbelt') await pushToStudents((id, p) => p.grade === 'dan' && wantsReminders(p), { title: 'Black belt class today', body: 'There’s a black belt class at the Epping dojo today. See the calendar for details.' }, { reminder: type }, 'calendar');
    else await pushToStudents((id, p) => (p.disciplines || []).includes('karate') && wantsReminders(p), { title: 'Grading today', body: 'It’s grading day today. Good luck! See the calendar for details.' }, { reminder: type }, 'calendar');
    return;
  }
  if (type !== 'training') return;
  for (const c of CLASSES) {
    const [h, m] = c.start.split(':').map(Number);
    const until = h * 60 + m - now.minutes;
    const kind = until > 115 && until <= 120 ? '2h' : until > 0 && until <= 5 ? '5m' : null;
    if (!kind || !(await once(db, `${now.date}_${c.key}_${kind}`))) continue;
    const month = now.date.slice(0, 7);
    let unpaid = new Set();
    if (kind === '2h') {
      // Remind students who haven't paid this month to bring or pay their fee.
      const [students, payments] = await Promise.all([db.collection('users').where('role', '==', 'student').get(), db.collection('payments').where('month', '==', month).get()]);
      // Paid = this month's monthly fee, or anything paid today (e.g. for today's lesson).
      const dayStart = Date.now() - now.minutes * 60e3;
      const paid = new Set(payments.docs.filter(d => d.data().kind === 'monthly' || (d.data().at || 0) >= dayStart).map(d => d.data().uid));
      students.forEach(d => { if (!d.data().feesExempt && !paid.has(d.id)) unpaid.add(d.id); });
    }
    const isTarget = (id, p) => (p.disciplines || []).includes(c.key) && atIlford(p) && wantsReminders(p);
    const students = await db.collection('users').where('role', '==', 'student').get();
    const plain = studentTargets(students, (id, p) => isTarget(id, p) && !unpaid.has(id));
    const owing = studentTargets(students, (id, p) => isTarget(id, p) && unpaid.has(id));
    const title = kind === '2h' ? `${c.name} starts in 2 hours` : `${c.name} starts in 5 minutes`;
    const body = kind === '2h' ? `${c.name} is at ${c.time} tonight at the Ilford dojo. See you there!` : `${c.name} starts at ${c.time}. Time to get ready!`;
    await send(plain, { title, body }, { reminder: c.key }, STUDENT_URL + '#calendar');
    if (owing.length) await send(owing, { title, body: body + ' Your fees for this month aren’t paid yet: pay per lesson or monthly in the app, or at the dojo.' }, { reminder: c.key }, STUDENT_URL + '#pay');
  }
});

// ---- Fees: PayPal payment tracking and monthly reminders ----
const londonMonth = () => {
  const [{ value: y }, , { value: m }] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).reverse();
  return `${y}-${m}`;
};

// PayPal Instant Payment Notification. Links from the student app send custom = uid|fee id|month.
// Each notification is checked with PayPal before anything is recorded.
exports.paypalIpn = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  const raw = req.rawBody.toString('utf8');
  const check = await fetch('https://ipnpb.paypal.com/cgi-bin/webscr', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EmptyHands-IPN' },
    body: 'cmd=_notify-validate&' + raw,
  });
  if ((await check.text()) !== 'VERIFIED') { console.warn('IPN not verified'); return res.status(200).end(); }
  const p = new URLSearchParams(raw);
  if (p.get('payment_status') !== 'Completed' || p.get('mc_currency') !== 'GBP') return res.status(200).end();
  const db = getFirestore();
  const settings = (await db.doc('settings/payments').get()).data() || {};
  const ours = (settings.paypal || '').toLowerCase();
  const to = ['receiver_email', 'business', 'receiver_id'].map(k => (p.get(k) || '').toLowerCase());
  if (!ours || !to.includes(ours)) { console.warn('IPN for a different PayPal account'); return res.status(200).end(); }
  const txn = p.get('txn_id') || '';
  if (!/^[A-Z0-9]{6,30}$/i.test(txn)) return res.status(200).end();
  const [uid, feeId, month] = (p.get('custom') || '').split('|');
  const user = uid && /^[A-Za-z0-9]{10,40}$/.test(uid) ? await db.doc('users/' + uid).get() : null;
  const fee = (settings.fees || []).find(f => f.id === feeId);
  const amount = Number(p.get('mc_gross')) || 0;
  // Only counts as the monthly fee if it's a per-month fee paid in full.
  const monthly = !!fee && fee.per === 'month' && amount + 0.001 >= Number(fee.price);
  await db.doc('payments/pp-' + txn).set({
    uid: user && user.exists ? uid : null, name: user && user.exists ? user.data().name : '',
    feeId: fee ? fee.id : '', feeName: fee ? fee.name : (p.get('item_name') || 'PayPal payment').slice(0, 120),
    amount, month: /^\d{4}-\d{2}$/.test(month || '') ? month : londonMonth(), kind: monthly ? 'monthly' : 'other',
    method: 'paypal', txn, payer: `${p.get('first_name') || ''} ${p.get('last_name') || ''} ${p.get('payer_email') || ''}`.trim().slice(0, 160),
    at: Date.now(),
  }, { merge: true });
  res.status(200).end();
});

// On the 7th of each month, if Sensei switched on automatic reminders, message every accepted
// student who hasn't paid this month's fee (the message also arrives as a push notification).
exports.monthlyReminders = onSchedule({ schedule: '0 10 7 * *', timeZone: 'Europe/London', region: REGION }, async () => {
  const db = getFirestore();
  const settings = (await db.doc('settings/payments').get()).data() || {};
  if (!settings.autoRemind) return;
  const month = londonMonth();
  const monthName = new Date(month + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const [students, payments] = await Promise.all([
    db.collection('users').where('role', '==', 'student').get(),
    db.collection('payments').where('month', '==', month).get(),
  ]);
  const paid = new Set(payments.docs.filter(d => d.data().kind === 'monthly').map(d => d.data().uid));
  for (const doc of students.docs) {
    const s = doc.data();
    if (s.feesExempt || paid.has(doc.id) || (s.feeReminded || {})[month]) continue;
    const text = `Hi ${(s.name || '').split(' ')[0]}, just a reminder that your ${monthName} fees (monthly or per lesson) haven’t been paid yet. You can pay in the app under Home → Pay fees, or at the dojo. Thank you!`;
    const now = Date.now();
    await db.collection(`chats/${doc.id}/messages`).add({ text, from: 'coach', kind: 'fees', author: 'EmptyHands Sensei', uid: 'system', createdAt: FieldValue.serverTimestamp() });
    await db.doc('chats/' + doc.id).set({ name: s.name || '', lastAt: now, lastFrom: 'coach', lastText: text.slice(0, 140), coachReadAt: now }, { merge: true });
    await doc.ref.update({ [`feeReminded.${month}`]: now });
  }
});
