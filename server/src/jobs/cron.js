import cron from 'node-cron';
import { User, RLSnapshot } from '../models.js';
import { generateSchedule } from '../services/scheduler.js';

export function startJobs() {
  // Nightly 00:30: regenerate every user's schedule (also refreshes exam-mode review queues)
  cron.schedule('30 0 * * *', async () => {
    try {
      for await (const u of User.find()) await generateSchedule(u);
      console.log('[cron] schedules regenerated');
    } catch (e) { console.error('[cron] nightly failed', e.message); }
  });
  // Every 6 hours: snapshot RL agent weights
  cron.schedule('0 */6 * * *', async () => {
    try {
      for await (const u of User.find({ rlEpisodes: { $gt: 0 } }))
        await RLSnapshot.create({ userId: u._id, weights: u.rlWeights, episodes: u.rlEpisodes });
      console.log('[cron] RL snapshots saved');
    } catch (e) { console.error('[cron] snapshot failed', e.message); }
  });
}
