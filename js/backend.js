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
    setClassReminders: (uid, on) => F.updateDoc(ref('users', uid), { classReminders: !!on }),
    // A Sensei's devices, so the Cloud Functions can notify them.
    addCoachDevice: (uid, email, token) => F.setDoc(ref('coachDevices', uid), { email, pushTokens: F.arrayUnion(token), updatedAt: Date.now() }, { merge: true }),
    removeCoachDevice: (uid, email, token) => F.setDoc(ref('coachDevices', uid), { email, pushTokens: F.arrayRemove(token), updatedAt: Date.now() }, { merge: true }),
    listStudents: async () => rows(await F.getDocs(F.query(F.collection(db, 'users'), F.where('role', 'in', ['student', 'removed', 'declined'])))),
    watchProfile: (uid, cb) => F.onSnapshot(ref('users', uid), s => cb(s.exists() ? s.data() : null), err => console.error(err)),
    watchRequests: cb => F.onSnapshot(F.query(F.collection(db, 'users'), F.where('role', '==', 'pending')),
      snap => cb(rows(snap)), err => console.error(err)),

    // EmptyHands menu: one private thread per student, shared by all coaches.
    // chats/{uid} holds a summary (for the coach's list and unread counts); messages live under it.
    watchChats: cb => F.onSnapshot(F.query(F.collection(db, 'chats'), F.orderBy('lastAt', 'desc'), F.limit(500)),
      snap => cb(rows(snap)), err => console.error(err)),
    watchChat: (uid, cb) => F.onSnapshot(ref('chats', uid), s => cb(s.exists() ? s.data() : null), err => console.error(err)),
    watchThread: (uid, cb) => F.onSnapshot(
      F.query(F.collection(db, 'chats', uid, 'messages'), F.orderBy('createdAt'), F.limitToLast(300)),
      snap => cb(rows(snap).map(m => ({ ...m, createdAt: millis(m.createdAt) }))),
      err => console.error(err)),
    sendMessage: async (uid, studentName, m) => {
      const now = Date.now();
      await F.addDoc(F.collection(db, 'chats', uid, 'messages'), { ...m, createdAt: F.serverTimestamp() });
      await F.setDoc(ref('chats', uid), { name: studentName, lastAt: now, lastFrom: m.from, lastText: m.text.slice(0, 140), [m.from + 'ReadAt']: now }, { merge: true });
    },
    markChatRead: (uid, who) => F.setDoc(ref('chats', uid), { [who + 'ReadAt']: Date.now() }, { merge: true }),

    // Shared channels everyone accepted can read: 'group' (group chat) and 'journal' (training journal).
    watchChannel: (ch, cb) => F.onSnapshot(
      F.query(F.collection(db, 'channels', ch, 'messages'), F.orderBy('createdAt'), F.limitToLast(300)),
      snap => cb(rows(snap).map(m => ({ ...m, createdAt: millis(m.createdAt) }))),
      err => console.error(err)),
    postChannel: (ch, m) => F.addDoc(F.collection(db, 'channels', ch, 'messages'), { ...m, createdAt: F.serverTimestamp() }),
    deleteChannelMessage: (ch, id) => F.deleteDoc(ref('channels', ch, 'messages', id)),
    // Authors can change what they wrote; it's then marked as edited.
    editChannelMessage: (ch, id, text) => F.updateDoc(ref('channels', ch, 'messages', id), { text, editedAt: F.serverTimestamp() }),
    editMessage: (uid, id, text) => F.updateDoc(ref('chats', uid, 'messages', id), { text, editedAt: F.serverTimestamp() }),

    // Sensei's homework. Each student ticks items off in users/{uid}.homeworkDone.
    // Sensei sees all homework. A student (uid + their groups) only asks for what the security
    // rules let them read: homework set for them, and group homework for their groups.
    watchHomework: (cb, uid, audiences) => {
      const out = h => ({ ...h, createdAt: millis(h.createdAt) });
      if (!uid) return F.onSnapshot(F.query(F.collection(db, 'homework'), F.orderBy('createdAt', 'desc'), F.limit(200)),
        snap => cb(rows(snap).map(out)), err => console.error(err));
      const parts = { mine: [], group: [] };
      const emit = () => cb([...parts.mine, ...parts.group].map(out).sort((a, b) => b.createdAt - a.createdAt));
      const col = F.collection(db, 'homework');
      const stops = [
        F.onSnapshot(F.query(col, F.where('student', '==', uid)), snap => { parts.mine = rows(snap); emit(); }, err => console.error(err)),
        F.onSnapshot(F.query(col, F.where('student', '==', ''), F.where('audience', 'in', audiences)), snap => { parts.group = rows(snap); emit(); }, err => console.error(err)),
      ];
      return () => stops.forEach(stop => stop());
    },
    addHomework: h => F.addDoc(F.collection(db, 'homework'), { ...h, createdAt: F.serverTimestamp() }),
    deleteHomework: id => F.deleteDoc(ref('homework', id)),
    setHomeworkDone: (uid, id, done) => F.updateDoc(ref('users', uid), new F.FieldPath('homeworkDone', id), done ? Date.now() : F.deleteField()),

    // Sensei sees every notice; a student passes their groups and gets only those notices.
    watchNotifications: (cb, audiences) => F.onSnapshot(
      audiences
        ? F.query(F.collection(db, 'notifications'), F.where('audience', 'in', audiences), F.limit(200))
        : F.query(F.collection(db, 'notifications'), F.orderBy('createdAt', 'desc'), F.limit(200)),
      snap => cb(rows(snap).map(n => ({ ...n, createdAt: millis(n.createdAt) })).sort((a, b) => b.createdAt - a.createdAt)),
      err => console.error(err)),
    addNotification: n => F.addDoc(F.collection(db, 'notifications'), { ...n, createdAt: F.serverTimestamp() }),
    deleteNotification: id => F.deleteDoc(ref('notifications', id)),

    getCalendar: async year => { const s = await F.getDoc(ref('calendars', String(year))); return s.exists() ? s.data() : null; },
    saveCalendar: (year, data) => F.setDoc(ref('calendars', String(year)), { ...data, year: +year, updatedAt: Date.now() }),
    listCalendarYears: async () => (await F.getDocs(F.collection(db, 'calendars'))).docs.map(d => +d.id),

    getCoaches: async () => { const s = await F.getDoc(ref('settings', 'coaches')); return s.exists() ? s.data().emails || [] : []; },

    // Coach sign-in approval. A sign-in is identified by the token's auth_time; the panel asks for
    // approval with a loginRequests doc, and a Cloud Function emails the owner a link that writes
    // coachSessions/{uid} once approved.
    signInTime: async () => +(await auth.currentUser.getIdTokenResult()).claims.auth_time,
    requestCoachLogin: async (uid, email, authTime) => F.addDoc(F.collection(db, 'loginRequests'),
      { uid, email, authTime, device: navigator.userAgent.slice(0, 300), createdAt: F.serverTimestamp() }),
    watchCoachSession: (uid, cb) => F.onSnapshot(ref('coachSessions', uid), s => cb(s.exists() ? s.data() : null), () => cb(null)),
    refreshToken: () => auth.currentUser.getIdToken(true),
    saveCoaches: emails => F.setDoc(ref('settings', 'coaches'), { emails }),
    getPayments: async () => { const s = await F.getDoc(ref('settings', 'payments')); return s.exists() ? s.data() : null; },
    // Payment records: written by Sensei (cash etc.) or the paypalIpn function; students read their own.
    watchMyPayments: (uid, cb) => F.onSnapshot(F.query(F.collection(db, 'payments'), F.where('uid', '==', uid)),
      snap => cb(rows(snap).sort((a, b) => b.at - a.at)), err => console.error(err)),
    watchPaymentsForMonth: (month, cb) => F.onSnapshot(F.query(F.collection(db, 'payments'), F.where('month', '==', month)),
      snap => cb(rows(snap)), err => console.error(err)),
    addPayment: p => F.addDoc(F.collection(db, 'payments'), { ...p, at: Date.now() }),
    deletePayment: id => F.deleteDoc(ref('payments', id)),
    savePayments: data => F.setDoc(ref('settings', 'payments'), { ...data, updatedAt: Date.now() }),
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
  // Generic live queries: watch(key, read, cb) re-runs read() whenever that key changes, here or in another tab.
  const subs = new Map();
  const emit = k => (subs.get(k) || []).forEach(fn => fn());
  const watch = (k, read, cb) => {
    const fn = () => cb(read());
    if (!subs.has(k)) subs.set(k, new Set());
    subs.get(k).add(fn); setTimeout(fn);
    return () => subs.get(k).delete(fn);
  };
  addEventListener('storage', e => {
    if (e.key === K + 'notifications') emitNotes();
    if (e.key === K + 'session') emitAuth();
    if (e.key && e.key.startsWith(K)) emit(e.key.slice(K.length));
  });
  const save = (k, v) => { store(k, v); emit(k); };
  const table = name => ({ all: () => load(name, {}), put: (id, v) => { const t = load(name, {}); t[id] = v; save(name, t); }, del: id => { const t = load(name, {}); delete t[id]; save(name, t); } });
  const users = table('users');
  const cals = table('calendars');
  const chats = table('chats');

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
    setClassReminders: async (uid, on) => users.put(uid, { ...(users.all()[uid] || {}), classReminders: !!on }),
    addCoachDevice: async () => {},
    removeCoachDevice: async () => {},
    listStudents: async () => Object.entries(users.all()).map(([id, u]) => ({ id, ...u })).filter(u => ['student', 'removed', 'declined'].includes(u.role)),
    watchProfile: (uid, cb) => watch('users', () => users.all()[uid] || null, cb),
    watchRequests: cb => watch('users', () => Object.entries(users.all()).map(([id, u]) => ({ id, ...u })).filter(u => u.role === 'pending'), cb),

    watchChats: cb => watch('chats', () => Object.entries(chats.all()).map(([id, c]) => ({ id, ...c })).sort((a, b) => b.lastAt - a.lastAt), cb),
    watchChat: (uid, cb) => watch('chats', () => chats.all()[uid] || null, cb),
    watchThread: (uid, cb) => watch('msgs:' + uid, () => load('msgs:' + uid, []), cb),
    sendMessage: async (uid, studentName, m) => {
      const now = Date.now();
      save('msgs:' + uid, [...load('msgs:' + uid, []), { ...m, id: 'm' + now.toString(36) + Math.random().toString(36).slice(2, 5), createdAt: now }]);
      chats.put(uid, { ...(chats.all()[uid] || {}), name: studentName, lastAt: now, lastFrom: m.from, lastText: m.text.slice(0, 140), [m.from + 'ReadAt']: now });
    },
    markChatRead: async (uid, who) => chats.put(uid, { ...(chats.all()[uid] || {}), [who + 'ReadAt']: Date.now() }),

    watchChannel: (ch, cb) => watch('ch:' + ch, () => load('ch:' + ch, []), cb),
    postChannel: async (ch, m) => { const now = Date.now(); save('ch:' + ch, [...load('ch:' + ch, []), { ...m, id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 5), createdAt: now }]); },
    deleteChannelMessage: async (ch, id) => save('ch:' + ch, load('ch:' + ch, []).filter(m => m.id !== id)),
    editChannelMessage: async (ch, id, text) => save('ch:' + ch, load('ch:' + ch, []).map(m => m.id === id ? { ...m, text, editedAt: Date.now() } : m)),
    editMessage: async (uid, id, text) => save('msgs:' + uid, load('msgs:' + uid, []).map(m => m.id === id ? { ...m, text, editedAt: Date.now() } : m)),

    watchHomework: cb => watch('homework', () => load('homework', []).sort((a, b) => b.createdAt - a.createdAt), cb),
    addHomework: async h => { const now = Date.now(); save('homework', [...load('homework', []), { ...h, id: 'h' + now.toString(36), createdAt: now }]); },
    deleteHomework: async id => save('homework', load('homework', []).filter(h => h.id !== id)),
    setHomeworkDone: async (uid, id, done) => {
      const u = users.all()[uid] || {}; const d = { ...(u.homeworkDone || {}) };
      if (done) d[id] = Date.now(); else delete d[id];
      users.put(uid, { ...u, homeworkDone: d });
    },

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
    // Demo mode has no email: sign-ins are approved straight away.
    signInTime: async () => 1,
    requestCoachLogin: async () => {},
    watchCoachSession: (uid, cb) => { setTimeout(() => cb({ authTime: 1 })); return () => {}; },
    refreshToken: async () => {},
    saveCoaches: async emails => store('coaches', emails),
    getPayments: async () => load('payments', null),
    watchMyPayments: (uid, cb) => watch('pmts', () => load('pmts', []).filter(p => p.uid === uid).sort((a, b) => b.at - a.at), cb),
    watchPaymentsForMonth: (month, cb) => watch('pmts', () => load('pmts', []).filter(p => p.month === month), cb),
    addPayment: async p => save('pmts', [...load('pmts', []), { ...p, id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now() }]),
    deletePayment: async id => save('pmts', load('pmts', []).filter(p => p.id !== id)),
    savePayments: async data => save('payments', { ...data, updatedAt: Date.now() }),
  };
}
