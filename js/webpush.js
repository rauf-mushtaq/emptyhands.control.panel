// Notifications on the website and home-screen apps, through Firebase Cloud Messaging web push.
// (The phone apps use native push instead: see js/native.js.) Needs WEB_PUSH_KEY in js/config.js.
import { WEB_PUSH_KEY } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

// iPhone and iPad only allow web notifications once the app is added to the home screen.
export const webPushReady = () => !!WEB_PUSH_KEY && 'serviceWorker' in navigator && 'PushManager' in window
  && 'Notification' in window && location.protocol === 'https:' && !window.Capacitor;

// The device's push token, asking for permission first when `ask` is true; null if not allowed.
export async function webPushToken(ask) {
  if (!webPushReady() || Notification.permission === 'denied') return null;
  if (Notification.permission !== 'granted' && (!ask || (await Notification.requestPermission()) !== 'granted')) return null;
  const reg = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
  await navigator.serviceWorker.ready;
  const [{ getApp }, M] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-messaging.js')]);
  if (!(await M.isSupported())) return null;
  return M.getToken(M.getMessaging(getApp()), { vapidKey: WEB_PUSH_KEY, serviceWorkerRegistration: reg });
}
