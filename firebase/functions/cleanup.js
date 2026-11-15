// What happens to a student's data when they delete their account (see privacy.html in the
// student app). Payment records are kept for the dojo's accounts; everything else goes.
const { FieldValue } = require('firebase-admin/firestore');

async function removeUserData(db, uid) {
  const done = { chats: 0, posts: 0, awards: 0, homework: 0, attendance: 0 };
  const remove = async query => { const snap = await query.get(); await Promise.all(snap.docs.map(d => d.ref.delete())); return snap.size; };

  // Their chats with Sensei (the shared one and any with one Sensei), with every message in them.
  const chats = await db.collection('chats').where('student', '==', uid).get();
  const refs = new Map(chats.docs.map(d => [d.ref.path, d.ref]));
  refs.set('chats/' + uid, db.doc('chats/' + uid)); // older shared chats may not have 'student'
  for (const ref of refs.values()) await db.recursiveDelete(ref);
  done.chats = refs.size;

  // Group chat and training journal posts, medals, homework set just for them, their licence.
  for (const ch of ['group', 'journal']) done.posts += await remove(db.collection(`channels/${ch}/messages`).where('uid', '==', uid));
  done.awards = await remove(db.collection('awards').where('uid', '==', uid));
  done.homework = await remove(db.collection('homework').where('student', '==', uid));
  await db.doc('licences/' + uid).delete();

  // Take them off the registers they were marked present on.
  const att = await db.collection('attendance').where('present', 'array-contains', uid).get();
  await Promise.all(att.docs.map(d => d.ref.update({ present: FieldValue.arrayRemove(uid) })));
  done.attendance = att.size;

  await db.doc('users/' + uid).delete();
  return done;
}

module.exports = { removeUserData };
