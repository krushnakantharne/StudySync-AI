// All tunable constants live here (values come from the project report).
export const MAX_SUBJECTS = 15;
export const MAX_EXAM_WEEKS = 12;
export const REVIEW_MINS = 30;

// Bayesian Knowledge Tracing
export const BKT = { pLearn: 0.15, pSlip: 0.1, pGuess: 0.2 };
// Initial mastery prior by difficulty (harder = lower prior)
export const PRIOR = { 1: 0.35, 2: 0.3, 3: 0.25, 4: 0.2, 5: 0.15 };

// Priority Ranker weights
export const PRIORITY_W = { gap: 0.35, recency: 0.25, prox: 0.25, diff: 0.15 };

// Focus fusion weights (Section 3.3 of the report)
export const FOCUS_W = { keystroke: 0.4, appSwitch: 0.35, webcam: 0.25 };

// Reinforcement learning (Table 3.7 reward weights)
export const RL = {
  alpha: 0.05,
  gamma: 0.9,
  epsStart: 0.3,
  epsMin: 0.05,
  decay: 0.99,
  minSessions: 10, // sessions needed before 'auto' mode trusts the RL agent
  reward: { gap: 0.35, recency: 0.25, prox: 0.25, done: 0.15 },
};
