// One-off: deletes every message in EmptyHands chats, as the head of the dojo asked on 15 November 2026:
// all private chats (chats/*, with their messages), all group chats and the training journal
// (channels/*/messages), all notices (notifications) and the reports about messages (reports).
// Run by the "Delete all messages" workflow; removed from the repository afterwards.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'emptyhands-student-portal' });
(async () => {
  const db = getFirestore();
  const count = async ref => (await ref.count().get()).data().count;
  const wipeEach = async col => {
    let msgs = 0;
    const docs = await db.collection(col).listDocuments(); // includes ones that only hold messages
    for (const ref of docs) { msgs += await count(ref.collection('messages')); await db.recursiveDelete(ref); }
    return { places: docs.length, msgs };
  };
  const chats = await wipeEach('chats');
  const channels = await wipeEach('channels');
  const notices = await count(db.collection('notifications'));
  await db.recursiveDelete(db.collection('notifications'));
  const reports = await count(db.collection('reports'));
  await db.recursiveDelete(db.collection('reports'));
  console.log(`Deleted ${chats.msgs} private messages in ${chats.places} chats, ${channels.msgs} group chat and journal posts in ${channels.places} channels, ${notices} notices and ${reports} reports.`);
  const left = (await count(db.collection('notifications'))) + (await db.collection('chats').listDocuments()).length + (await db.collection('channels').listDocuments()).length;
  console.log(left ? `Still left: ${left}` : 'Nothing left.');
})().catch(err => { console.error(err); process.exit(1); });
