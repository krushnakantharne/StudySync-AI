import { httpError } from '../middleware/error.js';

// Use the same projection on every endpoint, including history and detail reads.
export function publicAttempt(attempt) {
  const result = attempt.toObject ? attempt.toObject() : structuredClone(attempt);
  if (!result.submittedAt) {
    for (const q of result.questions) {
      delete q.snapshot.correctOptionIdx;
      delete q.snapshot.explanation;
    }
  }
  return result;
}

export function gradeAttempt(attempt, answers) {
  if (!Array.isArray(answers)) throw httpError(400, 'Answers must be an array');
  const known = new Set(attempt.questions.map((q) => String(q._id)));
  const selected = new Map();
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== 'string' || !known.has(answer.questionId)) {
      throw httpError(400, 'Unknown question in answers');
    }
    if (selected.has(answer.questionId)) throw httpError(400, 'Duplicate question in answers');
    const idx = answer.selectedIdx;
    if (idx !== null && (!Number.isInteger(idx) || idx < 0 || idx > 3)) {
      throw httpError(400, 'Answer index must be null or an integer from 0 to 3');
    }
    selected.set(answer.questionId, idx);
  }
  let score = 0;
  const questions = attempt.questions.map((question) => {
    const q = question.toObject ? question.toObject() : structuredClone(question);
    q.selectedIdx = selected.get(String(q._id)) ?? null;
    if (q.selectedIdx !== null && q.selectedIdx === q.snapshot.correctOptionIdx) score++;
    return q;
  });
  return { questions, score, percentage: questions.length ? Math.round(100 * score / questions.length) : 0 };
}
