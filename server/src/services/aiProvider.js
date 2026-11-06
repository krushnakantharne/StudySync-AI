// src/services/aiProvider.js
// Gemini-powered MCQ generation.
//
// Speed / reliability design:
//  * Uses Node's built-in fetch with AbortSignal.timeout (node-fetch v3 ignores the old `timeout` option,
//    which is why requests could hang for minutes before).
//  * Splits the exam into small batches that run IN PARALLEL (10 questions ~ 5-10 s instead of minutes).
//  * Thinking is disabled and JSON output is enforced through a response schema (no parsing surprises).
//  * Retries on 429/500/502/503/504 with short backoff and falls back to a second model.
//  * Has a hard overall deadline so the HTTP request never outlives the hosting proxy's limit (502/503).

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const setting = (key, fallback, min, max) => {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

const cfg = () => ({
  key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  models: [process.env.GEMINI_MODEL || 'gemini-2.5-flash', process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite'],
  perCallTimeoutMs: setting('GEMINI_CALL_TIMEOUT_MS', 20000, 1000, 60000),
  totalTimeoutMs: setting('GEMINI_TOTAL_TIMEOUT_MS', 40000, 1000, 45000),
  batchSize: setting('GEMINI_BATCH_SIZE', 5, 1, 10),
});

export const aiConfigured = () => !!cfg().key;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      questionText: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correctOptionIdx: { type: 'INTEGER' },
      explanation: { type: 'STRING' },
      topic: { type: 'STRING' },
    },
    required: ['questionText', 'options', 'correctOptionIdx', 'explanation', 'topic'],
  },
};

function buildPrompt({ subjectName, topics, difficulty, count }) {
  const levels = ['very easy', 'easy', 'medium', 'hard', 'very hard'];
  return `You are an exam setter. Write exactly ${count} multiple-choice questions for the subject "${subjectName}".
Questions MUST be based only on these topics (spread them across the topics): ${topics.join('; ')}.
Difficulty: ${levels[Math.max(1, Math.min(5, difficulty)) - 1]} (${difficulty}/5).
Rules: each question has exactly 4 distinct options; exactly one is correct; "correctOptionIdx" is 0-3; vary the position of the correct answer; "topic" must be one of the topics above (copy it exactly); "explanation" is one short sentence. No "all of the above" options. Do not repeat questions.`;
}

/** Keep only valid, well-formed questions from whatever the model returned. */
function sanitize(raw, topics, difficulty) {
  let arr = raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try { arr = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\[[\s\S]*\]/);
      try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const q of arr) {
    if (!q || typeof q.questionText !== 'string' || !Array.isArray(q.options)) continue;
    if (!q.questionText.trim() || !topics.includes(q.topic)) continue;
    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) continue;
    const options = q.options.map((o) => o.trim());
    const idx = q.correctOptionIdx;
    if (options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) continue;
    out.push({
      questionText: q.questionText.trim(),
      options,
      correctOptionIdx: idx,
      explanation: String(q.explanation || '').trim(),
      topic: q.topic,
      difficulty,
    });
  }
  return out;
}

async function callGemini({ model, prompt, key, timeoutMs }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      // Thinking makes 2.5 models much slower; writing MCQs doesn't need it.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const resp = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Gemini ${resp.status}: ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

/** One batch: tries each model, retrying transient errors, until the deadline. */
async function generateBatch(params, deadline, key, models, perCallTimeoutMs) {
  const prompt = buildPrompt(params);
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 2000) throw lastErr || new Error('AI deadline reached');
      try {
        const text = await callGemini({ model, prompt, key, timeoutMs: Math.min(perCallTimeoutMs, remaining) });
        const qs = sanitize(text, params.topics, params.difficulty);
        if (qs.length) return qs;
        lastErr = new Error('Gemini returned no valid questions');
      } catch (e) {
        lastErr = e;
        if ([400, 401, 403].includes(e.status)) throw e; // bad key / bad request: retrying will not help
        if (e.status === 404) break;                     // model not available -> try next model
        if (e.status && !RETRYABLE.has(e.status)) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
  }
  throw lastErr || new Error('Gemini failed');
}

/**
 * Generate MCQs with Gemini. Never throws: returns the valid questions it got (possibly fewer than
 * `count`) and reports problems through `onError` so the route can show a useful message.
 */
export async function generateAIQuestions({ subjectName, topics, difficulty, count, onError }) {
  const { key, models, perCallTimeoutMs, totalTimeoutMs, batchSize } = cfg();
  if (!Number.isInteger(count) || count < 1 || count > 30 || !Array.isArray(topics)) { onError?.(new Error('Invalid question request')); return []; }
  if (!key) { onError?.(new Error('GEMINI_API_KEY is not set on the server')); return []; }
  if (!topics.length) { onError?.(new Error('This subject has no topics')); return []; }

  const deadline = Date.now() + totalTimeoutMs;
  const batches = [];
  for (let left = count; left > 0; left -= batchSize) batches.push(Math.min(batchSize, left));

  const results = await Promise.allSettled(
    batches.map((n, i) => {
      // rotate topic order per batch so questions spread across all topics
      const rotated = topics.map((_, k) => topics[(k + i) % topics.length]);
      return generateBatch({ subjectName, topics: rotated, difficulty, count: n }, deadline, key, models, perCallTimeoutMs);
    })
  );

  const questions = [];
  const seen = new Set();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const q of r.value) {
        const k = q.questionText.toLowerCase();
        if (!seen.has(k)) { seen.add(k); questions.push(q); }
      }
    } else onError?.(r.reason);
  }
  return questions.slice(0, count);
}
