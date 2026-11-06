// src/routes/exams.js
import { Router } from 'express';
import { ExamAttempt, Question, Subject } from '../models.js';
import { generateAIQuestions } from '../services/aiProvider.js';
import { httpError, integer } from '../middleware/error.js';
import { gradeAttempt, publicAttempt } from '../services/examResults.js';

const r = Router();

// Helper: pull stored questions from the bank (used only to top up if AI returns fewer than requested)
async function getBankQuestions(subjectId, difficulty, count, topicNames) {
  if (count <= 0) return [];
  const pool = await Question.find({
    subjectId,
    topic: { $in: topicNames },
    difficulty: { $gte: difficulty - 1, $lte: difficulty + 1 },
  }).limit(count * 3).lean();
  return pool.sort(() => 0.5 - Math.random()).slice(0, count);
}

const toSnapshot = (q) => ({
  questionText: q.questionText,
  options: q.options,
  correctOptionIdx: q.correctOptionIdx,
  explanation: q.explanation,
  topic: q.topic,
  difficulty: q.difficulty,
});

// Generate exam attempt (create but not start)
// POST /exams/generate { subjectId, difficulty, count, durationMins, topics? }
r.post('/exams/generate', async (req, res) => {
  const { subjectId, difficulty = 3, count = 10, durationMins = 15, topics: pickedTopics } = req.body;
  const userId = req.user._id;
  const subj = await Subject.findOne({ _id: subjectId, userId });
  if (!subj) throw httpError(404, 'Subject not found');
  const diff = integer(difficulty, 1, 5, 'Difficulty');
  const qCount = integer(count, 1, 30, 'Question count');
  const dur = integer(durationMins, 1, 180, 'Duration mins');

  if (pickedTopics !== undefined && !Array.isArray(pickedTopics)) throw httpError(400, 'Topics must be an array');

  // Topics = the topics uploaded for this subject (optionally narrowed by the user)
  let topicNames = subj.topics.map((t) => t.name);
  if (Array.isArray(pickedTopics) && pickedTopics.length) {
    if (pickedTopics.some((t) => typeof t !== 'string' || !topicNames.includes(t))) throw httpError(400, 'Choose topics from this subject');
    const wanted = new Set(pickedTopics);
    const filtered = topicNames.filter((n) => wanted.has(n));
    if (filtered.length) topicNames = filtered;
  }
  if (!topicNames.length) throw httpError(422, 'Add at least one topic to this subject before generating an exam');

  // 1) Gemini (parallel batches, hard time limit)
  let aiError = null;
  const aiQuestions = await generateAIQuestions({
    subjectName: subj.subjectName,
    topics: topicNames,
    difficulty: diff,
    count: qCount,
    onError: (e) => { aiError = e; console.error('[exam-generate] Gemini error:', e?.message || e); },
  });

  let selected = aiQuestions.map((q) => ({ snapshot: toSnapshot(q) }));
  let source = 'AI';

  // 2) Top up from the question bank if the AI returned fewer than requested
  if (selected.length < qCount) {
    const bank = await getBankQuestions(subjectId, diff, qCount - selected.length, topicNames);
    if (bank.length) {
      const seen = new Set(selected.map((q) => q.snapshot.questionText.trim().toLowerCase()));
      selected = selected.concat(bank.filter((q) => {
        const key = q.questionText.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map((q) => ({ questionId: q._id, snapshot: toSnapshot(q) })));
      source = aiQuestions.length ? 'MIXED' : 'BANK';
    }
  }

  if (!selected.length) {
        const st = aiError?.status;
    const hint = !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY
      ? 'GEMINI_API_KEY is not configured on the server (add it to server/.env and restart).'
      : st === 429 ? 'Gemini rate limit / quota reached - wait a minute and try again.'
      : [400, 401, 403].includes(st) ? `Gemini rejected the request (${st}). Check that GEMINI_API_KEY is valid and the Generative Language API is enabled. Details: ${String(aiError.message).slice(0, 160)}`
      : st === 404 ? 'The Gemini model name was not found - check GEMINI_MODEL in server/.env.'
      : `The AI service did not respond in time (${aiError?.message ? String(aiError.message).slice(0, 120) : 'timeout'}). Please try again.`;
      throw httpError(503, `Could not generate questions. ${hint}`);
  }

  const expiresAt = new Date(Date.now() + dur * 60 * 1000);
  const attempt = await ExamAttempt.create({
    userId,
    subjectId,
    title: `${subj.subjectName} weekly exam`,
    source,
    questions: selected,
    expiresAt,
  });

  res.status(201).json(publicAttempt(attempt));
});

// Submit exam answers
// POST /exams/:id/submit { answers: [{questionId, selectedIdx}] }
r.post('/exams/:id/submit', async (req, res) => {
  const attempt = await ExamAttempt.findOne({ _id: req.params.id, userId: req.user._id });
  if (!attempt) throw httpError(404, 'Exam attempt not found');
  if (attempt.submittedAt) throw httpError(400, 'Exam already submitted');
  if (new Date() > attempt.expiresAt) throw httpError(400, 'Exam time expired');
  const graded = gradeAttempt(attempt, req.body.answers ?? []);
  // Only one concurrent request can submit an attempt, and expiry is checked at write time.
  const result = await ExamAttempt.findOneAndUpdate(
    { _id: attempt._id, userId: req.user._id, submittedAt: null, expiresAt: { $gte: new Date() } },
    { $set: { ...graded, submittedAt: new Date() } },
    { new: true, runValidators: true },
  );
  if (!result) throw httpError(409, 'Exam already submitted or time expired');
  res.json(publicAttempt(result));
});

// List user's exam attempts
r.get('/exams', async (req, res) => {
  const attempts = await ExamAttempt.find({ userId: req.user._id }).sort({ startedAt: -1 });
  res.json(attempts.map(publicAttempt));
});

// Get single exam attempt details
r.get('/exams/:id', async (req, res) => {
  const attempt = await ExamAttempt.findOne({ _id: req.params.id, userId: req.user._id });
  if (!attempt) throw httpError(404, 'Exam attempt not found');
  res.json(publicAttempt(attempt));
});

export default r;
