// One-off data updates, run by the deploy workflow after each deploy (safe to run again).
// 1. Shared chats from before private chats with one Sensei existed: add sensei: 'all' and student,
//    so a Sensei's chat list (which asks for sensei in ['all', theirKey]) includes them.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'emptyhands-student-portal' });
(async () => {
  const db = getFirestore();
  const chats = await db.collection('chats').get();
  let n = 0;
  for (const doc of chats.docs) {
    if (doc.data().sensei) continue;
    const [student, key] = doc.id.split('~');
    await doc.ref.update({ sensei: key || 'all', student });
    n++;
  }
  console.log(`Chats updated: ${n} of ${chats.size}`);
})().catch(err => { console.error(err); process.exit(1); });
