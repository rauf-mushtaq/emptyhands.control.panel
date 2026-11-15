// One-off: checks a Sensei's account and makes a password-reset link for it, at the head
// Sensei's request (the reset email didn't arrive). The account is chosen by the SHA-256 of its
// email (TARGET), and the result is encrypted for the requester's public key (PUBKEY), so nothing
// readable appears in this public repository's logs. Removed after use.
const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'emptyhands-student-portal' });
const hash = e => crypto.createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex');
(async () => {
  const auth = getAuth();
  let user = null, token;
  do {
    const page = await auth.listUsers(1000, token);
    user = user || page.users.find(u => hash(u.email) === process.env.TARGET) || null;
    token = page.pageToken;
  } while (!user && token);
  const coaches = (await getFirestore().doc('settings/coaches').get()).data() || {};
  const report = { found: !!user };
  if (user) {
    Object.assign(report, {
      email: user.email, verified: user.emailVerified, disabled: user.disabled,
      created: user.metadata.creationTime, lastSignIn: user.metadata.lastSignInTime,
      onSenseiList: (coaches.emails || []).map(e => e.toLowerCase()).includes(user.email.toLowerCase()),
      keptWithoutConfirming: (coaches.uids || []).includes(user.uid),
      resetLink: await auth.generatePasswordResetLink(user.email),
    });
  } else {
    report.senseiList = coaches.emails || [];
  }
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(report)), cipher.final()]);
  const pub = Buffer.from(process.env.PUBKEY, 'base64').toString();
  const out = { k: crypto.publicEncrypt({ key: pub, oaepHash: 'sha256' }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  console.log('ENCRYPTED:' + Buffer.from(JSON.stringify(out)).toString('base64'));
})().catch(err => { console.error(err.code || 'error'); process.exit(1); });
