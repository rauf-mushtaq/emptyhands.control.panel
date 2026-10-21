// Pushes to students' phones: Sensei's notices and homework (to everyone they're for),
// Sensei's private messages (to that student) and Sensei's group chat posts (to everyone). Deploy with `firebase deploy --only functions`
// (see README.md). Needs the Firebase Blaze plan.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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
