import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dailyGoalMins: { type: Number, default: 180, min: 1 },
    maxSessionMins: { type: Number, default: 90 },
    preferredStartHour: { type: Number, default: 9 },
    preferredEndHour: { type: Number, default: 22 },
    schedulerMode: { type: String, enum: ['auto', 'heuristic', 'rl'], default: 'auto' },
    activityConsent: { type: Boolean, default: false },
    activityRules: [{ _id: false, domain: { type: String, required: true }, category: { type: String, required: true } }],
    // RL weights: [bias, masteryGap, recency, proximity, topicsRemaining, difficulty] (warm-started from the priority formula)
    rlWeights: { type: [Number], default: [0, 0.35, 0.25, 0.25, 0.1, 0.15] },
    rlEpisodes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const topicSchema = new Schema({
  name: { type: String, required: true },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  mastery: { type: Number, default: 0.25 }, // BKT P(L)
  lastStudied: { type: Date, default: null },
  studyCount: { type: Number, default: 0 },
  easeFactor: { type: Number, default: 2.5 },
  intervalDays: { type: Number, default: 1 },
  repetitions: { type: Number, default: 0 },
  nextReview: { type: Date, default: null },
  masteryHistory: [{ _id: false, date: Date, mastery: Number }],
});

const subjectSchema = new Schema(
  {
    userId: { ...ref('User'), required: true, index: true },
    subjectName: { type: String, required: true, trim: true },
    difficulty: { type: Number, min: 1, max: 5, required: true },
    topics: [topicSchema],
    examEventId: { ...ref('ExamEvent'), default: null },
    examDate: { type: Date, default: null },
    paperCode: { type: String, default: null },
    examModeActive: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);
subjectSchema.virtual('totalTopics').get(function () {
  return this.topics ? this.topics.length : 0;
});

const examSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  subjectId: ref('Subject'),
  title: String,
  examDate: { type: Date, required: true },
  paperCode: String,
});

const sessionSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  subjectId: { ...ref('Subject'), required: true },
  topicName: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, default: null },
  plannedMins: { type: Number, required: true },
  actualMins: { type: Number, default: null },
  avgFocusScore: { type: Number, default: null },
  completed: { type: Boolean, default: false },
  selfRating: { type: Number, default: null },
  activityTracking: { type: Boolean, default: false },
  activityPaused: { type: Boolean, default: false },
  activityPauseAt: { type: Date, default: null },
  rlReward: { type: Number, default: null },
  scheduleItemId: { ...ref('ScheduleItem'), default: null },
  mode: { type: String, enum: ['heuristic', 'rl', 'exam'], default: 'heuristic' },
});

const focusSchema = new Schema({
  sessionId: { ...ref('StudySession'), required: true, index: true },
  minuteIndex: { type: Number, required: true },
  keystrokeScore: { type: Number, min: 0, max: 100 },
  appSwitchScore: { type: Number, min: 0, max: 100 },
  webcamScore: { type: Number, min: 0, max: 100, default: null },
  compositeScore: { type: Number, required: true },
  dominantSignal: { type: String, enum: ['keystroke', 'appSwitch', 'webcam'], required: true },
});

const scheduleSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  subjectId: { ...ref('Subject'), default: null },
  topicName: String,
  date: Date,
  startTime: { type: Date, index: true },
  endTime: Date,
  type: { type: String, enum: ['study', 'review', 'break'], default: 'study' },
  plannedMins: Number,
  status: { type: String, enum: ['planned', 'done', 'skipped'], default: 'planned' },
  generatedBy: { type: String, enum: ['heuristic', 'rl', 'exam'], default: 'heuristic' },
  weekStart: String,
});

const surveySchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  type: { type: String, enum: ['pre', 'post'], required: true },
  score: { type: Number, min: 1, max: 10, required: true },
  createdAt: { type: Date, default: Date.now },
});

const rlSnapSchema = new Schema({
  userId: ref('User'),
  weights: [Number],
  episodes: Number,
  at: { type: Date, default: Date.now },
});

export const User = model('User', userSchema);
export const Subject = model('Subject', subjectSchema);
export const ExamEvent = model('ExamEvent', examSchema);
export const StudySession = model('StudySession', sessionSchema);
export const FocusLog = model('FocusLog', focusSchema);
export const ScheduleItem = model('ScheduleItem', scheduleSchema);
export const Survey = model('Survey', surveySchema);
export const RLSnapshot = model('RLSnapshot', rlSnapSchema);

// Question bank schema
const questionSchema = new Schema({
  subjectId: { ...ref('Subject'), required: true },
  topic: { type: String, required: true },
  difficulty: { type: Number, min: 1, max: 5, required: true },
  questionText: { type: String, required: true },
  options: { type: [String], validate: v => v.length === 4, required: true },
  correctOptionIdx: { type: Number, min: 0, max: 3, required: true },
  explanation: { type: String },
});
export const Question = model('Question', questionSchema);

// Exam attempt schema
const examAttemptSchema = new Schema({
  userId: { ...ref('User'), required: true },
  subjectId: { ...ref('Subject'), required: true },
  title: { type: String },
  source: { type: String, enum: ['AI', 'BANK', 'MIXED'], required: true },
  questions: [{
    questionId: { type: Schema.Types.ObjectId, ref: 'Question' },
    snapshot: {
      questionText: String,
      options: [String],
      correctOptionIdx: Number,
      explanation: String,
      topic: String,
      difficulty: Number,
    },
    selectedIdx: { type: Number, min: 0, max: 3 },
  }],
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  submittedAt: { type: Date },
  score: { type: Number },
  percentage: { type: Number },
});
export const ExamAttempt = model('ExamAttempt', examAttemptSchema);

// Optional, privacy-limited browser monitoring. Store domain and time only: no URLs, titles or content.
const activityEventSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  sessionId: { ...ref('StudySession'), required: true, index: true },
  eventId: { type: String, required: true },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  domain: { type: String, default: null },
  category: { type: String, enum: ['Study', 'Coding', 'Reference', 'Entertainment', 'Gaming', 'Idle', 'Unknown'], required: true },
  createdAt: { type: Date, default: Date.now },
});
activityEventSchema.index({ userId: 1, eventId: 1 }, { unique: true });
activityEventSchema.index({ sessionId: 1, from: 1, to: 1 });
export const ActivityEvent = model('ActivityEvent', activityEventSchema);

// 10-minute one-use pairing codes and revocable, hashed extension credentials.
const activityCredentialSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  secretHash: { type: String, required: true, unique: true },
  type: { type: String, enum: ['pair', 'extension'], required: true },
  expiresAt: { type: Date, required: true },
});
activityCredentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ActivityCredential = model('ActivityCredential', activityCredentialSchema);
