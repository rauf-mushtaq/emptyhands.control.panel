// Firebase SDK for the website, loaded from Google's CDN. The phone apps replace this
// file with a bundled copy (mobile/build.mjs), so they never download code at runtime.
export { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
export * as A from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
export * as F from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
