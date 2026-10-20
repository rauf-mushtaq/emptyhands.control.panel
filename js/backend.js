// Data layer. Uses Firebase (Auth + Firestore) when js/config.js has a config,
// otherwise a demo store in localStorage with the same interface.
import { firebaseConfig, OWNER_EMAILS } from './config.js';

export const DEMO = !firebaseConfig.apiKey;
const OWNERS = OWNER_EMAILS.map(e => e.trim().toLowerCase());

let api;
export async function backend() {
  if (!api) api = DEMO ? demoBackend() : await firebaseBackend();
  return api;
}

// A coach is an owner or listed in settings/coaches, with a verified email.
export async function isCoach(user) {
  if (!user) return false;
  const b = await backend();
  if (DEMO) return b.isDemoCoach(user);
  if (!user.emailVerified) return false;
  if (OWNERS.includes(user.email)) return true;
  try { return (await b.getCoaches()).includes(user.email); } catch { return false; }
}

export function errorText(err) {
  const code = (err && err.code) || '';
  return ({
    'auth/email-already-in-use': 'An account with that email already exists — try signing in.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/weak-password': 'Please choose a password of at least 6 characters.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
    'auth/requires-recent-login': 'For your security, please sign out and in again first.',
    'permission-denied': 'You don’t have permission to do that.',
  })[code] || (err && err.message) || 'Something went wrong. Please try again.';
}

async function firebaseBackend() {
  const { initializeApp, A, F } = await import('./firebase-sdk.js');
  const app = initializeApp(firebaseConfig);
  // initializeAuth rather than getAuth: getAuth loads a popup/redirect helper that
  // never finishes inside the iOS app's web view.
  const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
  const db = F.getFirestore(app);
  const ref = (...p) => F.doc(db, ...p);
  const wrap = u => u && { uid: u.uid, email: (u.email || '').toLowerCase(), emailVerified: u.emailVerified };
  const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const millis = t => (t && t.toMillis ? t.toMillis() : Date.now());

  return {
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(wrap(u))),
    signUp: async (email, pw) => wrap((await A.createUserWithEmailAndPassword(auth, email.trim(), pw)).user),
    signIn: async (email, pw) => wrap((await A.signInWithEmailAndPassword(auth, email.trim(), pw)).user),
    signOut: () => A.signOut(auth),
    resetPassword: email => A.sendPasswordResetEmail(auth, email.trim()),
    sendVerification: () => A.sendEmailVerification(auth.currentUser),
    reloadUser: async () => {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      return wrap(auth.currentUser);
    },
    reauthenticate: pw => A.reauthenticateWithCredential(auth.currentUser, A.EmailAuthProvider.credential(auth.currentUser.email, pw)),
    deleteAccount: () => A.deleteUser(auth.currentUser),

    getProfile: async uid => { const s = await F.getDoc(ref('users', uid)); return s.exists() ? s.data() : null; },
    saveProfile: (uid, data) => F.setDoc(ref('users', uid), data, { merge: true }),
    deleteProfile: uid => F.deleteDoc(ref('users', uid)),
    addPushToken: (uid, token) => F.updateDoc(ref('users', uid), { pushTokens: F.arrayUnion(token) }),
    removePushToken: (uid, token) => F.updateDoc(ref('users', uid), { pushTokens: F.arrayRemove(token) }),
    listStudents: async () => rows(await F.getDocs(F.query(F.collection(db, 'users'), F.where('role', 'in', ['student', 'removed'])))),

    watchNotifications: cb => F.onSnapshot(
      F.query(F.collection(db, 'notifications'), F.orderBy('createdAt', 'desc'), F.limit(200)),
      snap => cb(rows(snap).map(n => ({ ...n, createdAt: millis(n.createdAt) }))),
      err => console.error(err)),
    addNotification: n => F.addDoc(F.collection(db, 'notifications'), { ...n, createdAt: F.serverTimestamp() }),
    deleteNotification: id => F.deleteDoc(ref('notifications', id)),

    getCalendar: async year => { const s = await F.getDoc(ref('calendars', String(year))); return s.exists() ? s.data() : null; },
    saveCalendar: (year, data) => F.setDoc(ref('calendars', String(year)), { ...data, year: +year, updatedAt: Date.now() }),
    listCalendarYears: async () => (await F.getDocs(F.collection(db, 'calendars'))).docs.map(d => +d.id),

    getCoaches: async () => { const s = await F.getDoc(ref('settings', 'coaches')); return s.exists() ? s.data().emails || [] : []; },
    saveCoaches: emails => F.setDoc(ref('settings', 'coaches'), { emails }),
  };
}

function demoBackend() {
  const K = 'eh-demo:';
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(K + k)) ?? fallback; } catch { return fallback; } };
  const store = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch { /* storage blocked */ } };
  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  const authCbs = new Set();
  const noteCbs = new Set();

  const accounts = () => load('accounts', {});
  const me = () => {
    const uid = load('session', null);
    const hit = Object.entries(accounts()).find(([, a]) => a.uid === uid);
    return hit ? { uid, email: hit[0], emailVerified: true } : null;
  };
  const notes = () => load('notifications', []).sort((a, b) => b.createdAt - a.createdAt);
  const emitAuth = () => { const u = me(); authCbs.forEach(cb => cb(u)); };
  const emitNotes = () => { const n = notes(); noteCbs.forEach(cb => cb(n)); };
  addEventListener('storage', e => {
    if (e.key === K + 'notifications') emitNotes();
    if (e.key === K + 'session') emitAuth();
  });
  const table = name => ({ all: () => load(name, {}), put: (id, v) => { const t = load(name, {}); t[id] = v; store(name, t); }, del: id => { const t = load(name, {}); delete t[id]; store(name, t); } });
  const users = table('users');
  const cals = table('calendars');

  return {
    // Accounts made on the coach page are coaches in demo mode.
    isDemoCoach: u => !!(accounts()[u.email] || {}).coach || OWNERS.includes(u.email),
    onAuth: cb => { authCbs.add(cb); setTimeout(() => cb(me())); return () => authCbs.delete(cb); },
    signUp: async (email, pw, opts = {}) => {
      email = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('auth/invalid-email');
      if (pw.length < 6) fail('auth/weak-password');
      const a = accounts();
      if (a[email]) fail('auth/email-already-in-use');
      a[email] = { uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), pw, coach: !!opts.coach };
      store('accounts', a);
      store('session', a[email].uid);
      emitAuth();
      return me();
    },
    signIn: async (email, pw) => {
      const a = accounts()[email.trim().toLowerCase()];
      if (!a || a.pw !== pw) fail('auth/invalid-credential');
      store('session', a.uid);
      emitAuth();
      return me();
    },
    signOut: async () => { store('session', null); emitAuth(); },
    resetPassword: async () => {},
    sendVerification: async () => {},
    reloadUser: async () => me(),
    reauthenticate: async pw => { if ((accounts()[me().email] || {}).pw !== pw) fail('auth/invalid-credential'); },
    deleteAccount: async () => {
      const u = me(); const a = accounts(); delete a[u.email]; store('accounts', a);
      store('session', null); emitAuth();
    },

    getProfile: async uid => users.all()[uid] || null,
    saveProfile: async (uid, data) => users.put(uid, { ...(users.all()[uid] || {}), ...data }),
    deleteProfile: async uid => users.del(uid),
    addPushToken: async () => {},
    removePushToken: async () => {},
    listStudents: async () => Object.entries(users.all()).map(([id, u]) => ({ id, ...u })).filter(u => u.role === 'student' || u.role === 'removed'),

    watchNotifications: cb => { noteCbs.add(cb); setTimeout(() => cb(notes())); return () => noteCbs.delete(cb); },
    addNotification: async n => {
      store('notifications', [...notes(), { ...n, id: 'n' + Date.now().toString(36), createdAt: Date.now() }]);
      emitNotes();
    },
    deleteNotification: async id => { store('notifications', notes().filter(n => n.id !== id)); emitNotes(); },

    getCalendar: async year => cals.all()[year] || null,
    saveCalendar: async (year, data) => cals.put(year, { ...data, year: +year, updatedAt: Date.now() }),
    listCalendarYears: async () => Object.keys(cals.all()).map(Number),

    getCoaches: async () => load('coaches', []),
    saveCoaches: async emails => store('coaches', emails),
  };
}
