// Pushes to students' phones: Sensei's notices and homework (to everyone they're for),
// Sensei's private messages (to that student) and Sensei's group chat posts (to everyone). Deploy with `firebase deploy --only functions`
// (see README.md). Needs the Firebase Blaze plan.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('node:crypto');
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

// The region must match the Firestore database location chosen in README.md.
exports.pushNotice = onDocumentCreated({ document: 'notifications/{id}', region: 'europe-west2' }, async event => {
  const notice = event.data.data();
  const db = getFirestore();
  const students = await db.collection('users').where('role', '==', 'student').get();

  const targets = []; // [token, userRef]
  students.forEach(doc => {
    const p = doc.data();
    if (isFor(notice.audience, p)) (p.pushTokens || []).forEach(t => targets.push([t, doc.ref]));
  });
  if (!targets.length) return;

  const body = notice.body.length > 180 ? notice.body.slice(0, 177) + '…' : notice.body;
  for (let i = 0; i < targets.length; i += 500) {
    const batch = targets.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch.map(([t]) => t),
      notification: { title: notice.title, body },
      data: { noticeId: event.params.id },
      android: { priority: 'high', notification: { color: '#A8342A', icon: 'ic_stat_notify' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    // Forget tokens for uninstalled apps.
    await Promise.all(res.responses.map((r, j) => (!r.success && GONE.includes(r.error && r.error.code)
      ? batch[j][1].update({ pushTokens: FieldValue.arrayRemove(batch[j][0]) })
      : null)));
    console.log(`notice ${event.params.id}: sent ${res.successCount}, failed ${res.failureCount}`);
  }
});

// A coach replied in a student's EmptyHands menu chat: push it to that student's phones.
exports.pushMessage = onDocumentCreated({ document: 'chats/{uid}/messages/{id}', region: 'europe-west2' }, async event => {
  const m = event.data.data();
  if (m.from !== 'coach') return;
  const user = await getFirestore().doc('users/' + event.params.uid).get();
  const tokens = (user.exists && user.data().role === 'student' && user.data().pushTokens) || [];
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: 'Message from ' + (m.author || 'your coach'), body: m.text.length > 180 ? m.text.slice(0, 177) + '…' : m.text },
    data: { chat: event.params.uid },
    android: { priority: 'high', notification: { color: '#A8342A', icon: 'ic_stat_notify' } },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  await Promise.all(res.responses.map((r, j) => (!r.success && GONE.includes(r.error && r.error.code)
    ? user.ref.update({ pushTokens: FieldValue.arrayRemove(tokens[j]) })
    : null)));
});

// Send one notification to every accepted student matching `isTarget(id, profile)`.
async function pushToStudents(isTarget, notification, data) {
  const students = await getFirestore().collection('users').where('role', '==', 'student').get();
  const targets = [];
  students.forEach(doc => { if (isTarget(doc.id, doc.data())) (doc.data().pushTokens || []).forEach(t => targets.push([t, doc.ref])); });
  for (let i = 0; i < targets.length; i += 500) {
    const batch = targets.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch.map(([t]) => t),
      notification: { ...notification, body: notification.body.length > 180 ? notification.body.slice(0, 177) + '…' : notification.body },
      data,
      android: { priority: 'high', notification: { color: '#A8342A', icon: 'ic_stat_notify' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    await Promise.all(res.responses.map((r, j) => (!r.success && GONE.includes(r.error && r.error.code)
      ? batch[j][1].update({ pushTokens: FieldValue.arrayRemove(batch[j][0]) })
      : null)));
  }
}

// Sensei set homework.
exports.pushHomework = onDocumentCreated({ document: 'homework/{id}', region: 'europe-west2' }, async event => {
  const h = event.data.data();
  await pushToStudents((id, p) => (h.student ? h.student === id : isFor(h.audience, p)),
    { title: 'New homework from ' + (h.from || 'Sensei'), body: h.title }, { homework: event.params.id });
});

// Sensei posted in the group chat (students' own posts aren't pushed, to keep it quiet).
exports.pushGroup = onDocumentCreated({ document: 'channels/group/messages/{id}', region: 'europe-west2' }, async event => {
  const m = event.data.data();
  if (m.from !== 'coach') return;
  await pushToStudents(() => true, { title: (m.author || 'Sensei') + ' in the group chat', body: m.text }, { channel: 'group' });
});

// ---- Coach sign-in approval ----
// Every new sign-in to the coach panel creates loginRequests/{id}. loginEmail emails the owner a
// link; approveLogin shows the sign-in details with Approve / Decline buttons and, on approve,
// writes coachSessions/{uid}, which the security rules require before any coach access.
// Emails go through Resend (resend.com); its API key is the RESEND_API_KEY secret.
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const OWNER_EMAIL = 'info@emptyhands.co.uk'; // keep in line with OWNERS in firestore.rules
const FROM = 'EmptyHands <onboarding@resend.dev>';
const REGION = 'europe-west2';
const LINK_MINUTES = 15;
const approveUrl = () => `https://${REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/approveLogin`;
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const londonTime = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

exports.loginEmail = onDocumentCreated({ document: 'loginRequests/{id}', region: REGION, secrets: [RESEND_API_KEY] }, async event => {
  const r = event.data.data();
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  await event.data.ref.update({ token, status: 'pending', expiresAt: now + LINK_MINUTES * 60e3 });
  const link = `${approveUrl()}?id=${event.params.id}&t=${token}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px">
    <h2>Someone is signing in to the EmptyHands Sensei panel</h2>
    <p><b>Account:</b> ${escHtml(r.email)}<br><b>When:</b> ${escHtml(londonTime(now))}<br><b>Device:</b> ${escHtml(r.device)}</p>
    <p>If this is you or one of your Sensei, approve it. If not, decline it and change that account's password.</p>
    <p><a href="${link}" style="display:inline-block;background:#a8342a;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none;font-weight:700">Review this sign-in</a></p>
    <p style="color:#777;font-size:13px">The link works for ${LINK_MINUTES} minutes.</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [OWNER_EMAIL], subject: `Approve Sensei sign-in: ${r.email}`, html,
      text: `Someone is signing in to the EmptyHands Sensei panel as ${r.email} (${londonTime(now)}).\nReview it here (works for ${LINK_MINUTES} minutes): ${link}` }),
  });
  if (!res.ok) console.error('approval email failed', res.status, await res.text());
});

function page(res, status, title, body) {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store').send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escHtml(title)} · EmptyHands</title><style>body{font-family:system-ui,sans-serif;background:#f6f2ea;color:#1c1a16;margin:0;padding:24px 16px}
main{max-width:460px;margin:8vh auto;background:#fffdf8;border:1px solid rgba(0,0,0,.1);border-radius:16px;padding:24px}
h1{font-size:1.4rem;margin:0 0 12px}button{font:inherit;font-weight:700;border-radius:99px;padding:12px 22px;border:1px solid #1c1a16;cursor:pointer;margin:6px 6px 0 0}
.ok{background:#a8342a;border-color:#a8342a;color:#fff}.no{background:#fff}dl{margin:0 0 16px}dt{font-size:.8rem;color:#7b7466}dd{margin:0 0 8px;overflow-wrap:anywhere}</style></head>
<body><main><h1>${escHtml(title)}</h1>${body}</main></body></html>`);
}

exports.approveLogin = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  const id = String((req.body && req.body.id) || req.query.id || '');
  const t = String((req.body && req.body.t) || req.query.t || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(id) || !/^[a-f0-9]{48}$/.test(t)) return page(res, 400, 'Link not valid', '<p>This approval link is incomplete.</p>');
  const db = getFirestore();
  const ref = db.doc('loginRequests/' + id);
  const snap = await ref.get();
  const r = snap.exists ? snap.data() : null;
  const tokenOk = r && r.token && crypto.timingSafeEqual(Buffer.from(r.token), Buffer.from(t));
  if (!tokenOk) return page(res, 404, 'Link not valid', '<p>This approval link isn’t valid.</p>');
  if (r.status !== 'pending') return page(res, 200, 'Already done', `<p>This sign-in was already <b>${escHtml(r.status)}</b>.</p>`);
  if (Date.now() > r.expiresAt) return page(res, 410, 'Link expired', '<p>This link has expired. On the coach panel, tap “Send the email again”.</p>');

  // Showing the page never approves anything (email scanners open links); only the buttons do.
  if (req.method !== 'POST') {
    return page(res, 200, 'Approve this sign-in?', `<dl><dt>Account</dt><dd>${escHtml(r.email)}</dd>
      <dt>Device</dt><dd>${escHtml(r.device)}</dd></dl>
      <form method="post"><input type="hidden" name="id" value="${escHtml(id)}"><input type="hidden" name="t" value="${escHtml(t)}">
      <button class="ok" name="action" value="approve">Approve</button><button class="no" name="action" value="deny">Decline</button></form>`);
  }
  const approve = req.body && req.body.action === 'approve';
  await db.doc('coachSessions/' + r.uid).set(approve
    ? { authTime: r.authTime, email: r.email, approvedAt: Date.now() }
    : { deniedAuthTime: r.authTime, deniedAt: Date.now() }, { merge: true });
  await ref.update({ status: approve ? 'approved' : 'declined', decidedAt: Date.now(), token: null });
  page(res, 200, approve ? 'Sign-in approved' : 'Sign-in declined', approve
    ? `<p><b>${escHtml(r.email)}</b> can now use the Sensei panel on that device.</p>`
    : `<p>The sign-in for <b>${escHtml(r.email)}</b> was declined and has been signed out. If you didn’t expect it, change that account’s password.</p>`);
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
    const text = `Hi ${(s.name || '').split(' ')[0]}, just a reminder that your ${monthName} fees haven’t been paid yet. You can pay in the app under Home → Pay fees, or at the dojo. Thank you!`;
    const now = Date.now();
    await db.collection(`chats/${doc.id}/messages`).add({ text, from: 'coach', author: 'EmptyHands Sensei', uid: 'system', createdAt: FieldValue.serverTimestamp() });
    await db.doc('chats/' + doc.id).set({ name: s.name || '', lastAt: now, lastFrom: 'coach', lastText: text.slice(0, 140), coachReadAt: now }, { merge: true });
    await doc.ref.update({ [`feeReminded.${month}`]: now });
  }
});
