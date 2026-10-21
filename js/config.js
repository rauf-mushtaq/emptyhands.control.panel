// EmptyHands student app & coach panel — settings. This file is the same in both
// repositories (emptyhands.student and emptyhands.control.panel): change it in both.

// 1. Your Firebase web app config (Firebase console → Project settings → General → Your apps).
//    (If apiKey is ever left empty the app runs in DEMO MODE, keeping data only in the browser.)
export const firebaseConfig = {
  apiKey: 'AIzaSyDxHlb-Bqnl2MQk5HcpCDte1Ozej2Fu6s4',
  authDomain: 'emptyhands-student-portal.firebaseapp.com',
  projectId: 'emptyhands-student-portal',
  storageBucket: 'emptyhands-student-portal.firebasestorage.app',
  messagingSenderId: '596775265118',
  appId: '1:596775265118:web:522b2582eddffb6ed6a5cf',
};

// 2. Head coaches. These emails can always open the coach panel (after verifying
//    their email) and can add other coaches from it. Keep this list identical to
//    OWNERS in firebase/firestore.rules (emptyhands.control.panel).
export const OWNER_EMAILS = ['info@emptyhands.co.uk'];

// 3. Where each part lives.
export const SITE_URL = 'https://rauf-mushtaq.github.io/emptyhands/';
export const STUDENT_URL = 'https://rauf-mushtaq.github.io/emptyhands.student/';
export const COACH_URL = 'https://rauf-mushtaq.github.io/emptyhands.control.panel/';

// 4. Coach sign-in approval: when true, every new sign-in to the coach panel waits until
//    someone approves it from the email sent to the first OWNER_EMAILS address. Needs the
//    loginEmail/approveLogin functions deployed (see README) — switch on only after that.
export const COACH_LOGIN_APPROVAL = false;

// 5. Automatic PayPal tracking: when true, PayPal payments made from the student app are
//    recorded against the student by the paypalIpn function. Switch on only after deploying it.
export const PAYPAL_AUTO_TRACK = false;

// 6. The recommended YouTube channel shown in the student app's EmptyHands menu.
//    Paste the channel's own address here (e.g. https://www.youtube.com/@ChannelName).
export const RECOMMENDED = {
  name: 'Shotokan Karate Academy',
  about: 'Watch Kanazawa Sensei perform the kata to help your practice at home.',
  url: 'https://www.youtube.com/results?search_query=Shotokan+Karate+Academy+Kanazawa+kata',
};
