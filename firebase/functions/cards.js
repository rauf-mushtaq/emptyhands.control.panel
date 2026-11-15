// Paying fees by card, Apple Pay or Google Pay in the student app, through Stripe Checkout.
// The money goes into the dojo's Stripe account, which pays it out to the dojo's bank account.
// Switched on only when the repository secret STRIPE_SECRET_KEY exists (see firebase.yml); the
// deploy then writes settings/cards { on: true } so the app shows the card buttons.
//
// 1. The app asks for a checkout (POST { action: 'checkout', fee }) with the student's sign-in
//    token. The price comes from Sensei's fees in settings/payments, never from the app.
// 2. Stripe's payment page sends the student back with the session id, and the app (or paid.html
//    in the phone apps) asks us to record it (POST { action: 'confirm', session }).
// 3. In case someone closes the page before they get back, sweep() records any paid checkouts
//    every 15 minutes. Each checkout is recorded once (cardsDone/{session id}).
const API = 'https://api.stripe.com/v1/';
const STRIPE_VERSION = '2024-06-20';
const STUDENT_URL = 'https://app.emptyhands.co.uk/';
const SESSION = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
const UID = /^[A-Za-z0-9]{10,40}$/;

const londonMonth = (d = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}`;
};

// Stripe takes form-encoded bodies with bracketed keys: line_items[0][quantity]=1.
function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

function stripeClient(key, fetchImpl = fetch) {
  return async (method, path, params) => {
    const q = params ? form(params) : '';
    const res = await fetchImpl(API + path + (method === 'GET' && q ? '?' + q : ''), {
      method,
      headers: { Authorization: 'Bearer ' + key, 'Stripe-Version': STRIPE_VERSION, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? q : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || 'Stripe answered ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  };
}

// The fee a student chose: one of Sensei's fees, or 'agreed' (the monthly fee Sensei set for a
// brown belt or above). Same rules as the PayPal tracking in index.js.
function findFee(settings, user, feeId) {
  if (feeId === 'agreed') {
    const n = Number(user && user.monthlyFee) || 0;
    return n > 0 ? { id: 'agreed', name: 'Karate monthly — agreed with Sensei', per: 'month', price: n } : null;
  }
  return ((settings && settings.fees) || []).find(f => f && f.id === feeId && Number(f.price) > 0) || null;
}

const pence = price => Math.round(Number(price) * 100);
// An error whose message is for the student (anything else gets a general message).
const oops = (status, message) => Object.assign(new Error(message), { status, own: true });
const label = (fee, name) => (fee.name + (name ? ' — ' + name : '')).slice(0, 250);

// Starts a Stripe Checkout for one fee. Returns the URL of Stripe's payment page.
async function checkout({ db, stripe, uid, email, feeId, native }) {
  const [userSnap, settingsSnap] = await Promise.all([db.doc('users/' + uid).get(), db.doc('settings/payments').get()]);
  if (!userSnap.exists) throw oops(403, 'Finish signing up in the app first.');
  const user = userSnap.data();
  const fee = findFee(settingsSnap.data(), user, feeId);
  if (!fee) throw oops(400, 'That fee isn’t available any more. Please refresh the page.');
  const amount = pence(fee.price);
  if (amount < 30 || amount > 100000) throw oops(400, 'That fee can’t be paid by card. Please pay Sensei at the dojo.');
  const month = londonMonth();
  const meta = { uid, feeId: fee.id, month };
  const back = native ? STUDENT_URL + 'paid.html' : STUDENT_URL;
  const session = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    // Cards only, which on Stripe's page includes Apple Pay and Google Pay (no Klarna and the like).
    payment_method_types: ['card'],
    submit_type: 'pay',
    locale: 'en-GB',
    line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: amount, product_data: { name: label(fee, user.name) } } }],
    client_reference_id: uid,
    customer_email: email || undefined,
    metadata: meta,
    payment_intent_data: { description: label(fee, user.name), metadata: meta },
    success_url: back + '?card={CHECKOUT_SESSION_ID}' + (native ? '' : '#pay'),
    cancel_url: native ? back + '?cancelled=1' : back + '#pay',
  });
  if (!session.url) throw new Error('Stripe didn’t return a payment page.');
  return session.url;
}

// Records a paid Checkout Session as a payment, once. Returns what was paid, or null if it isn't paid.
async function record(db, s) {
  if (!s || s.object !== 'checkout.session' || s.mode !== 'payment' || s.payment_status !== 'paid' || String(s.currency).toLowerCase() !== 'gbp') return null;
  const md = s.metadata || {};
  const uid = UID.test(md.uid || '') ? md.uid : null;
  const [userSnap, settingsSnap] = await Promise.all([uid ? db.doc('users/' + uid).get() : null, db.doc('settings/payments').get()]);
  const user = userSnap && userSnap.exists ? userSnap.data() : null;
  const fee = findFee(settingsSnap.data(), user, md.feeId);
  const amount = (Number(s.amount_total) || 0) / 100;
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const wallet = charge && charge.payment_method_details && charge.payment_method_details.card && charge.payment_method_details.card.wallet;
  const who = s.customer_details || {};
  const payment = {
    uid: user ? uid : null, name: user ? user.name || '' : '',
    feeId: fee ? fee.id : String(md.feeId || ''), feeName: fee ? fee.name : 'Card payment',
    amount, month: /^\d{4}-\d{2}$/.test(md.month || '') ? md.month : londonMonth(new Date((s.created || 0) * 1000 || Date.now())),
    // Only counts as the monthly fee if it's a per-month fee paid in full.
    kind: fee && fee.per === 'month' && amount + 0.001 >= Number(fee.price) ? 'monthly' : 'other',
    method: 'card', wallet: wallet && ['apple_pay', 'google_pay'].includes(wallet.type) ? wallet.type : '',
    txn: (pi ? pi.id : typeof s.payment_intent === 'string' ? s.payment_intent : '') || s.id,
    payer: `${who.name || ''} ${who.email || ''}`.trim().slice(0, 160),
    at: Date.now(),
  };
  const batch = db.batch();
  batch.create(db.doc('cardsDone/' + s.id), { at: payment.at });
  batch.set(db.doc('payments/card-' + s.id), payment);
  try { await batch.commit(); }
  catch (err) { if (err.code !== 6 && !/ALREADY_EXISTS/.test(String(err.message))) throw err; } // recorded already
  return { amount, feeName: payment.feeName, wallet: payment.wallet };
}

// Paid checkouts from the last two days that haven't been recorded yet.
async function sweep(db, stripe) {
  const list = await stripe('GET', 'checkout/sessions', { limit: 100, expand: ['data.payment_intent.latest_charge'] });
  const since = Date.now() / 1000 - 2 * 86400;
  let added = 0;
  for (const s of list.data || []) {
    if (s.created < since || s.payment_status !== 'paid') continue;
    if ((await db.doc('cardsDone/' + s.id).get()).exists) continue;
    if (await record(db, s)) added++;
  }
  return added;
}

// The HTTP function. GET: { ready } (used by the deploy's check).
function handler({ getDb, getAuth, makeStripe = stripeClient }) {
  return async (req, res) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (req.method === 'GET') return res.json({ ready: !!key });
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!key) return res.status(503).json({ error: 'Card payments aren’t switched on yet. Please pay with PayPal or at the dojo.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const db = getDb();
    const stripe = makeStripe(key);
    try {
      if (body.action === 'confirm') {
        if (!SESSION.test(String(body.session || ''))) return res.status(400).json({ error: 'Unknown payment.' });
        const s = await stripe('GET', 'checkout/sessions/' + body.session, { expand: ['payment_intent.latest_charge'] })
          .catch(err => { throw err.status === 404 ? oops(400, 'Unknown payment.') : err; });
        const done = await record(db, s);
        return res.json(done ? { paid: true, ...done } : { paid: false });
      }
      if (body.action === 'checkout') {
        const token = String(req.get('Authorization') || '').replace(/^Bearer /, '');
        let who;
        try { who = await getAuth().verifyIdToken(token); }
        catch { return res.status(401).json({ error: 'Please sign in again, then try once more.' }); }
        if (typeof body.fee !== 'string' || body.fee.length > 60) return res.status(400).json({ error: 'Choose a fee to pay.' });
        const url = await checkout({ db, stripe, uid: who.uid, email: who.email, feeId: body.fee, native: body.native === true });
        return res.json({ url });
      }
      return res.status(400).json({ error: 'Unknown request.' });
    } catch (err) {
      console.error('cardPayments', err.status || '', err.message);
      if (err.own) return res.status(err.status).json({ error: err.message });
      return res.status(502).json({ error: 'Card payments aren’t working right now. Please try again later, or pay with PayPal or at the dojo.' });
    }
  };
}

module.exports = { handler, sweep, record, checkout, findFee, form, stripeClient, londonMonth };
