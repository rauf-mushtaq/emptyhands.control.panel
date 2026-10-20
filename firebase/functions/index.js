// When a coach sends a notice (a new notifications/{id} document), push it to the
// phones of the students it's for. Deploy with `firebase deploy --only functions`
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
