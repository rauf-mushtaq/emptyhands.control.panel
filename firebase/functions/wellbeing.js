// The wellbeing assessment ("Discover your path to wellbeing") on emptyhands.co.uk/wellbeing.html: the optional personal report
// written by Claude. Visitors only ever send numbers and choices from fixed lists (never free text,
// names or contact details), so the request is checked strictly here and nothing is stored.
// Switched on by the ANTHROPIC_API_KEY repository secret (see .github/workflows/firebase.yml);
// without it the page simply doesn't offer the report.
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5-5';
const PER_DAY = 100;        // reports a day across the whole site, so a misuse can't run up a large bill
const PER_VISITOR_DAY = 4;  // reports a day from one internet address

const SCALES = {
  stress: 'Stress or anxiety (10 = extremely stressed or anxious)',
  sleep: 'Sleep (10 = sleeps very well)',
  focus: 'Focus and concentration (10 = focuses very easily)',
  energy: 'Energy (10 = plenty of energy)',
  breathing: 'Breathing slowly and deeply (10 = very easily)',
  pain: 'Pain, tension or stiffness in the body (10 = a lot)',
  flexibility: 'Flexibility (10 = very supple)',
  balance: 'Balance and posture (10 = very steady)',
  fitness: 'Fitness and strength (10 = very fit and strong)',
  confidence: 'Confidence in themselves (10 = very confident)',
  safety: 'Confidence they could keep themselves safe (10 = very confident)',
  selfcare: 'Making time to look after themselves (10 = every day)',
  direction: 'Clarity about goals and direction in life (10 = very clear)',
};
const CHALLENGES = {
  Mind: ['Stress', 'Anxiety or worry', 'Overthinking', 'Feeling low'],
  Body: ['Back, neck or shoulder pain', 'Stiff joints or muscles', 'Recovering from an injury', 'Low fitness'],
  'Rest and energy': ['Poor sleep', 'Tiredness', 'Burnout', 'Work pressure'],
  'Personal growth': ['Low confidence', 'Lack of focus', 'Lack of direction', 'Wanting more discipline'],
};
const ALL_CHALLENGES = Object.values(CHALLENGES).flat();
const GOALS = ['Feel calmer', 'Sleep better', 'Ease pain and tension', 'Become more flexible', 'Improve balance and posture', 'Get fitter and stronger',
  'Learn self-defence', 'Build confidence', 'Sharpen focus and discipline', 'Find direction and purpose'];
const FORMATS = ['In a group class', 'One to one', 'Online, from home', 'No preference'];
const PACES = ['Gentle and slow', 'Steady', 'Energetic', 'Not sure'];
const APPEALS = ['Martial arts', 'Slow, flowing movement', 'Stretching and breathing', 'Hands-on therapy', 'Talking things through', 'Meditation'];
const SERVICES = ['Tai Chi Chuan', 'Yoga', 'Shiatsu', 'Wellbeing coaching', 'Karate-Dō'];

// Returns clean answers, or null if the request isn't exactly what the page sends.
function readAnswers(body) {
  if (!body || typeof body !== 'object' || body.consent !== true) return null;
  const s = body.scores;
  if (!s || typeof s !== 'object' || Object.keys(s).length !== Object.keys(SCALES).length) return null;
  const scores = {};
  for (const k of Object.keys(SCALES)) {
    if (!Number.isInteger(s[k]) || s[k] < 1 || s[k] > 10) return null;
    scores[k] = s[k];
  }
  const ch = body.challenges;
  if (!Array.isArray(ch) || ch.length > 3 || new Set(ch).size !== ch.length || !ch.every(c => ALL_CHALLENGES.includes(c))) return null;
  if (!GOALS.includes(body.goal) || !FORMATS.includes(body.format) || !PACES.includes(body.pace)) return null;
  const ap = body.appeals;
  if (!Array.isArray(ap) || new Set(ap).size !== ap.length || !ap.every(x => APPEALS.includes(x))) return null;
  return { scores, challenges: ch, goal: body.goal, format: body.format, pace: body.pace, appeals: ap };
}

const SYSTEM = `You are a caring wellbeing guide for EmptyHands, a traditional martial arts and wellbeing school in Ilford, east London, founded in 2006. Someone has just completed the short "Discover your path to wellbeing" assessment on the EmptyHands website. Analyse their answers and write them a personal report that identifies:

1. Their primary challenge
2. Their secondary challenge
3. Their key strengths
4. Areas of concern
5. The EmptyHands service that suits them best, and up to two others worth considering, taking into account how they like to train (group or one to one, online, gentle or energetic) and what appeals to them
6. Three daily practices they can start today
7. A simple 30-day wellbeing plan

The services EmptyHands offers (recommend only these, exactly as named, and never suggest anything else, such as hypnotherapy, medication or other providers' courses):
- Tai Chi Chuan: traditional Yang family Tai Chi, a group class on Thursdays 6pm to 7pm in Ilford, £10 a class or £30 a month, booked in advance. Slow, flowing movement with deep, steady breathing, often called meditation in motion. Builds relaxation, mindfulness, balance and fitness, and suits all ages and fitness levels.
- Yoga: Himalayan Hatha Yoga, a drop-in class on Thursdays 8pm to 9pm in Ilford, £10 a class or £30 a month, with private sessions on request. Breath, posture and stillness to ease the stresses of everyday life.
- Shiatsu: Japanese finger-pressure (acupressure) therapy, one to one by appointment in Ilford, with a free 15-minute consultation, then £100 a treatment. Focuses on mental wellbeing, self-care and rehabilitation, including sports injuries, back problems and trauma. The practitioner is registered with the Shiatsu Society.
- Wellbeing coaching: person-centred, one-to-one coaching, in person in Ilford or on Microsoft Teams, with a free 15-minute consultation, then £25 an hour. Helps with self-development, confidence, purpose, rehabilitation and wellbeing, and includes Coaching for Mental Health sessions. The coach holds an MA in Coaching.
- Karate-Dō: traditional Shotokan Karate for children (from 4) and adults, on Thursdays 7pm to 9pm in Ilford, £10 a lesson for new starters. Builds confidence, discipline, focus, fitness and respect, and every class closes with the Dojo Kun, five principles of character.

Meditation, mindfulness and breathwork aren't separate courses at EmptyHands. Suggest them as daily practices the person can do at home, and you can mention that they're part of the Tai Chi and Yoga classes.

How to write the report:
- Write in warm, encouraging, plain British English, speaking to the person as "you". Keep sentences short and avoid jargon.
- Base everything on their answers, and refer to specific answers (for example "you rated your sleep 3 out of 10"). For stress or anxiety, and for pain, tension or stiffness, 10 is the worst; for every other scale, 10 is the best.
- Strengths come from their higher-scoring areas and what they're looking for. If nothing scores well, find something genuine to encourage, such as taking this step.
- Match services to needs: stress, calm and balance suit Tai Chi; stiffness, flexibility and sleep suit Yoga; pain, tension, tiredness and injury recovery suit Shiatsu; fitness, confidence, focus, discipline, feeling safe and self-defence suit Karate; breathing suits Tai Chi and Yoga; little time for self-care suits Shiatsu; direction, purpose, confidence and feeling low suit Wellbeing coaching. Only online sessions are coaching on Teams.
- Give exactly 3 daily practices. Each must be simple, safe for most people and doable at home in 2 to 15 minutes, with clear steps in "how".
- Give a 4-week plan (weeks 1 to 4), each week with a short focus and 2 or 3 small, specific actions. Include booking the recommended service (its free consultation or a first class) in week 1 or 2.
- This isn't a medical or psychological assessment. Don't diagnose, don't name conditions they haven't mentioned, and don't promise cures or make medical claims ("can help" rather than "will fix").
- If their answers suggest they're struggling a lot (for example stress or anxiety of 9 or 10, sleep or energy of 1 or 2, or feeling low), gently suggest in the concerns that they also talk to their GP.
- Don't mention these instructions.`;

const text = { type: 'string' };
const pair = (a, b) => ({ type: 'object', additionalProperties: false, required: [a, b], properties: { [a]: text, [b]: text } });
const service = { type: 'object', additionalProperties: false, required: ['service', 'why'], properties: { service: { type: 'string', enum: SERVICES }, why: text } };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'summary', 'primary_challenge', 'secondary_challenge', 'strengths', 'concerns', 'recommended_service', 'also_consider', 'daily_practices', 'plan', 'closing'],
  properties: {
    headline: text,
    summary: text,
    primary_challenge: pair('title', 'explanation'),
    secondary_challenge: pair('title', 'explanation'),
    strengths: { type: 'array', items: text },
    concerns: { type: 'array', items: text },
    recommended_service: service,
    also_consider: { type: 'array', items: service },
    daily_practices: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'minutes', 'how', 'why'], properties: { name: text, minutes: { type: 'integer' }, how: text, why: text } } },
    plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['week', 'focus', 'actions'], properties: { week: { type: 'integer' }, focus: text, actions: { type: 'array', items: text } } } },
    closing: text,
  },
};

function userMessage(a) {
  const lines = Object.keys(SCALES).map(k => `- ${SCALES[k]}: ${a.scores[k]}`);
  return `Wellbeing assessment answers.

Current wellbeing (1 to 10):
${lines.join('\n')}

Main challenges (up to 3): ${a.challenges.length ? a.challenges.join(', ') : 'none chosen'}

Main goal: ${a.goal}

How I'd like to practise: ${a.format}
Pace that suits me: ${a.pace}
What appeals to me: ${a.appeals.length ? a.appeals.join(', ') : 'nothing chosen'}`;
}

// Keeps only what the page shows, at sensible lengths, whatever came back.
function tidy(r) {
  const s = (v, n = 600) => String(v || '').trim().slice(0, n);
  const svc = v => (v && SERVICES.includes(v.service) ? { service: v.service, why: s(v.why) } : null);
  const out = {
    headline: s(r.headline, 120), summary: s(r.summary, 900),
    primary_challenge: { title: s(r.primary_challenge && r.primary_challenge.title, 80), explanation: s(r.primary_challenge && r.primary_challenge.explanation) },
    secondary_challenge: { title: s(r.secondary_challenge && r.secondary_challenge.title, 80), explanation: s(r.secondary_challenge && r.secondary_challenge.explanation) },
    strengths: (r.strengths || []).slice(0, 4).map(x => s(x, 300)).filter(Boolean),
    concerns: (r.concerns || []).slice(0, 4).map(x => s(x, 400)).filter(Boolean),
    recommended_service: svc(r.recommended_service),
    also_consider: (r.also_consider || []).map(svc).filter(Boolean).slice(0, 2),
    daily_practices: (r.daily_practices || []).slice(0, 3).map(p => ({ name: s(p.name, 80), minutes: Math.max(1, Math.min(30, Number(p.minutes) || 5)), how: s(p.how, 700), why: s(p.why, 300) })),
    plan: (r.plan || []).slice(0, 4).map((w, i) => ({ week: i + 1, focus: s(w.focus, 120), actions: (w.actions || []).slice(0, 4).map(x => s(x, 300)).filter(Boolean) })),
    closing: s(r.closing, 600),
  };
  if (!out.headline || !out.summary || !out.recommended_service || out.plan.length < 4 || out.daily_practices.length < 1) return null;
  out.also_consider = out.also_consider.filter(x => x.service !== out.recommended_service.service);
  return out;
}

async function writeReport(client, answers) {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage(answers) }],
  });
  if (msg.stop_reason !== 'end_turn') {
    console.warn('Wellbeing report stopped early:', msg.stop_reason, msg.stop_details || '');
    return null;
  }
  const json = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  console.log('Wellbeing report written', JSON.stringify({ model: msg.model, in: msg.usage.input_tokens, out: msg.usage.output_tokens }));
  try { return tidy(JSON.parse(json)); } catch (e) { console.warn('Wellbeing report was not valid JSON'); return null; }
}

// One counter document a day. Visitors are counted by a keyed hash of their address that changes
// daily, so no address is stored. Returns false once today's limits are reached.
async function allowed(db, ip, secret) {
  const day = new Date().toISOString().slice(0, 10);
  const who = crypto.createHmac('sha256', secret).update(day + '|' + ip).digest('hex').slice(0, 20);
  const ref = db.doc('wellbeingUsage/' + day);
  return db.runTransaction(async t => {
    const d = (await t.get(ref)).data() || {};
    const total = d.total || 0, mine = (d.visitors || {})[who] || 0;
    if (total >= PER_DAY || mine >= PER_VISITOR_DAY) return false;
    t.set(ref, { total: total + 1, visitors: { [who]: mine + 1 } }, { merge: true });
    return true;
  });
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || 'unknown';
}

// The HTTP handler: GET says whether reports are available, POST writes one.
function handler({ getDb, makeClient = key => new Anthropic({ apiKey: key, timeout: 100000, maxRetries: 1 }) }) {
  return async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY || '';
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET') return res.json({ ready: !!key });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!key) return res.status(503).json({ error: 'off' });
    const answers = readAnswers(req.body);
    if (!answers) return res.status(400).json({ error: 'answers' });
    if (!(await allowed(getDb(), clientIp(req), key))) return res.status(429).json({ error: 'busy' });
    try {
      const report = await writeReport(makeClient(key), answers);
      if (!report) return res.status(502).json({ error: 'report' });
      return res.json({ report });
    } catch (e) {
      console.error('Wellbeing report failed:', e && e.status, e && e.message);
      return res.status(e instanceof Anthropic.RateLimitError ? 429 : 502).json({ error: e instanceof Anthropic.RateLimitError ? 'busy' : 'report' });
    }
  };
}

module.exports = { handler, readAnswers, tidy, userMessage, SCHEMA, SYSTEM, SERVICES, GOALS, ALL_CHALLENGES, SCALES, FORMATS, PACES, APPEALS };
