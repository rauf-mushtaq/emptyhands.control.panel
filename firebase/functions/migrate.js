// One-off data updates, run by the deploy workflow after each deploy (safe to run again).
// 1. Shared chats from before private chats with one Sensei existed: add sensei: 'all' and student,
//    so a Sensei's chat list (which asks for sensei in ['all', theirKey]) includes them.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

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

  // 2. Sensei accounts made before listed Sensei had to confirm their email (15 November 2026)
  //    carry on without confirming: their uids go in settings/coaches.uids. Accounts made after
  //    that date never get added here, so they must confirm their email once.
  const BEFORE = Date.parse('2026-11-15T10:30:00Z');
  const coachesRef = db.doc('settings/coaches');
  const coaches = (await coachesRef.get()).data() || {};
  const uids = new Set(coaches.uids || []);
  let bound = 0;
  for (const email of coaches.emails || []) {
    try {
      const u = await getAuth().getUserByEmail(email);
      if (Date.parse(u.metadata.creationTime) < BEFORE && !uids.has(u.uid)) { uids.add(u.uid); bound++; }
    } catch (err) { if (err.code !== 'auth/user-not-found') throw err; }
  }
  if (bound) await coachesRef.set({ uids: [...uids] }, { merge: true });
  console.log(`Existing Sensei accounts kept without email confirmation: ${bound} added, ${uids.size} in all`);
})().catch(err => { console.error(err); process.exit(1); });
