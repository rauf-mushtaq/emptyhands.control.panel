// EmptyHands student app & coach panel — settings. This file is the same in both
// repositories (emptyhands.student and emptyhands.control.panel): change it in both.

// 1. Your Firebase web app config (Firebase console → Project settings → General → Your apps).
//    While apiKey is empty the app runs in DEMO MODE: accounts and notices are kept
//    only in the browser you're using, so nothing is shared between devices.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// 2. Head coaches. These emails can always open the coach panel (after verifying
//    their email) and can add other coaches from it. Keep this list identical to
//    OWNERS in firebase/firestore.rules (emptyhands.control.panel).
export const OWNER_EMAILS = ['info@emptyhands.co.uk'];

// 3. Where each part lives.
export const SITE_URL = 'https://rauf-mushtaq.github.io/emptyhands/';
export const STUDENT_URL = 'https://rauf-mushtaq.github.io/emptyhands.student/';
export const COACH_URL = 'https://rauf-mushtaq.github.io/emptyhands.control.panel/';
