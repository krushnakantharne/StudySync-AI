# StudySync AI — Activity-Aware Adaptive Study Scheduler

An AI-powered, activity-aware study scheduler built using the MERN stack. StudySync helps students plan their study sessions, monitor focus, track learning progress, and prepare for exams through personalized scheduling and adaptive learning algorithms.

> **Project:** Final-Year B.Tech CSE Project  
> **Technology:** MERN Stack + Gemini AI  
> **Architecture:** Full-Stack Web Application

## Key Features

- **AI-Powered Exam Generation:** Generate subject-specific exam questions using Google Gemini AI.
- **Adaptive Study Scheduling:** Create personalized weekly study plans based on priorities, learning progress, and exam dates.
- **Browser Activity Tracking:** Monitor study-related browser activity through the companion browser extension.
- **Live Focus Monitoring:** Track focus using activity signals and optional webcam-based face detection.
- **Knowledge Tracking:** Estimate topic mastery using Bayesian Knowledge Tracing (BKT).
- **Spaced Repetition:** Schedule revision sessions using adaptive review intervals.
- **Reinforcement Learning:** Improve scheduling decisions using a Q-learning-based approach.
- **Exam Mode:** Monitor topic readiness and identify knowledge gaps before examinations.
- **Analytics Dashboard:** Visualize study time, productivity, focus trends, topic mastery, and learning progress.
- **Real-Time Updates:** Use Socket.IO for live focus activity updates.
- **Authentication:** Secure user authentication using JWT access and refresh tokens.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT |
| AI Integration | Google Gemini API |
| Real-Time Communication | Socket.IO |
| Machine Learning | BKT, Q-Learning, TensorFlow.js |
| Browser Extension | JavaScript, Chrome Extension APIs |
| Testing | Node.js Test Runner, Vitest |
| Deployment | Render, Vercel |

## Project Structure

```text
StudySync_AI_Prototype/
│
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── focus.js
│   ├── package.json
│   └── vite.config.js
│
├── server/                  # Express backend
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   └── utils/
│   ├── tests/
│   └── package.json
│
├── extension/               # Browser activity extension
│   ├── background.js
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
│
├── qa/                      # Browser QA scripts
├── setup.mjs
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js 20 or later
- npm
- MongoDB Atlas account or local MongoDB installation
- Google Gemini API key (optional, for AI question generation)
- Google Chrome

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/krushnakantharne/StudySync-AI.git
cd StudySync-AI
```

### 2. Generate Environment Files

```bash
node setup.mjs
```

This script creates missing environment files with separate JWT secrets while preserving existing environment files.

### 3. Configure Backend Environment

Open `server/.env` and configure:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=http://localhost:5173
```

Use your own credentials. Never commit actual secrets or `.env` files to GitHub.

### 4. Install Backend Dependencies

```bash
cd server
npm ci
```

Start the backend:

```bash
npm run dev
```

### 5. Install Frontend Dependencies

Open another terminal:

```bash
cd client
npm ci
```

Start the frontend:

```bash
npm run dev
```

### 6. Open the Application

Visit:

http://localhost:5173

Register a new account, add subjects and topics, and start using StudySync.

## AI Integration — Google Gemini

StudySync integrates Google's Gemini API to generate examination questions based on subjects and topics.

To enable AI question generation:

1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Add the key to `server/.env`.

```env
GEMINI_API_KEY=your_api_key
```

3. Restart the backend server.

**Note:** AI question generation requires a valid API key and an available Gemini model. The application also includes fallback handling when AI generation is unavailable.

## Core Algorithms

| Algorithm | Purpose |
|---|---|
| Bayesian Knowledge Tracing (BKT) | Estimates student knowledge and topic mastery |
| Priority Ranking | Calculates study priorities based on learning gaps, recency, difficulty, and exam proximity |
| Adaptive Scheduling | Allocates study time and generates personalized schedules |
| Q-Learning | Improves scheduling decisions based on learning outcomes |
| Spaced Repetition | Determines suitable revision intervals |
| Focus Fusion | Combines activity signals to estimate focus levels |

## Browser Extension

StudySync includes a companion Chrome extension for activity-aware study tracking.

To load the extension:

1. Open Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable Developer Mode.
4. Click **Load unpacked**.
5. Select the project's `extension` folder.
6. Follow the pairing instructions in the application.

The extension supports consent-based activity tracking. Review the project's privacy settings before enabling tracking.

## Testing and Validation

Run backend tests:

```bash
npm test --prefix server
```

Run frontend tests:

```bash
npm test --prefix client
```

Build the frontend:

```bash
npm run build --prefix client
```

Additional browser QA scripts are available in the `qa/` directory.

## Deployment

The application can be deployed using platforms such as:

**Backend: Render / Railway**

Configure the required environment variables:

- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GEMINI_API_KEY`
- `CLIENT_URL`

**Frontend: Vercel / Netlify**

Configure:

```env
VITE_API_URL=https://your-backend-url/api
```

Make sure the backend CORS configuration allows your deployed frontend URL.

Webcam functionality requires HTTPS in production.

## Limitations

- Knowledge mastery estimates depend partly on student self-assessment.
- Reinforcement learning performance depends on the available study-session data.
- Webcam-based focus estimation is heuristic-based.
- Gemini question generation depends on API availability and usage limits.
- External LMS and calendar integrations are not currently included.

## Future Enhancements

- Advanced AI-based personalized learning recommendations.
- Improved learning analytics and progress prediction.
- Integration with external learning management systems.
- Mobile application support.
- Enhanced scheduling and recommendation algorithms.

## Author

**Krushnakant Harne**

B.Tech Computer Science and Engineering

GitHub: [@krushnakantharne](https://github.com/krushnakantharne)

---

If you find this project interesting, consider giving the repository a star!

**StudySync AI — Plan Smarter. Focus Better. Learn Faster.**