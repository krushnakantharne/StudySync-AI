import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { initSockets } from './sockets/focusSocket.js';
import { startJobs } from './jobs/cron.js';

const PORT = process.env.PORT || 5000;
if (!process.env.MONGO_URI || !process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error('Missing env vars. Copy .env.example to .env and fill in MONGO_URI and the JWT secrets.');
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
} catch (e) {
  console.error('\nCould not connect to MongoDB at MONGO_URI:', e.message);
  console.error('Start MongoDB locally, or put a MongoDB Atlas connection string in server/.env. Login/Register will show "Network Error" while the API is down.\n');
  process.exit(1);
}
console.log('MongoDB connected');
const server = http.createServer(app);
initSockets(server);
startJobs();
server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
