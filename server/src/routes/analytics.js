import { Router } from 'express';
import * as A from '../services/analytics.js';

import { integer } from '../middleware/error.js';
const r = Router();
const range = (v, fallback, max) => v === undefined ? fallback : integer(v, 1, max, 'Range');
r.get('/summary', async (req, res) => res.json(await A.summary(req.user)));
r.get('/time-distribution', async (req, res) => res.json(await A.timeDistribution(req.user, range(req.query.weeks, 4, 12))));
r.get('/focus-trend', async (req, res) => res.json(await A.focusTrend(req.user, range(req.query.days, 30, 120))));
r.get('/mastery', async (req, res) => res.json(await A.masteryProgress(req.user)));
r.get('/readiness', async (req, res) => res.json(await A.readiness(req.user)));
r.get('/productivity', async (req, res) => res.json(await A.productivity(req.user, range(req.query.weeks, 6, 12))));
export default r;
