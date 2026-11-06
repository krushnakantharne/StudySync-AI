# StudySync AI — Activity-Aware Prototype Upgrade

This ZIP is an **incremental upgrade of the uploaded project**, not a rewritten application. It preserves the original React routes, login/refresh tokens, Express APIs, MongoDB collections, Socket.IO focus tracker, BKT, SM-2, schedule generator, RL learner, Gemini integration, exams and analytics. The new fields/collections are additive.

## Run the application (Windows/macOS/Linux)

You need **Node.js 20+**, a reachable **MongoDB instance** (local or Atlas), and Chrome. Dependencies are not bundled.

```bash
node setup.mjs
# Edit server/.env: supply a working MONGO_URI. Keep the generated JWT secrets.
npm ci --prefix server
npm ci --prefix client
npm run dev --prefix server
# Open another terminal:
npm run dev --prefix client
```

Open **http://localhost:5173**. The API is at **http://localhost:5000**. Do not expose your `.env` files. The original `README.md` explains how to configure MongoDB/Atlas and optional Gemini MCQ generation. Without a working MongoDB connection, authentication, storage and the app cannot function.

## Pair the Chrome extension (local prototype)

1. Register or sign in to the application.
2. Go to **Settings & privacy → Browser activity tracking**. Read the explanation and explicitly select **Allow optional domain-only activity tracking**.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Select **Load unpacked** and choose the project's `extension` folder (the one containing `manifest.json`).
5. In StudySync Settings, click **Generate pairing code**. A code expires after ten minutes and can be used only once.
6. Open the extension icon, paste the pairing code, then click **Connect extension**.
7. Add a subject and topic. Open **Focus session**. Check **Enable browser activity tracking for this session**, then click **Start session**.
8. Visit websites, change tabs and leave Chrome idle. The extension observes **only while that session is active and unpaused**. It samples approximately every 30 seconds and on tab/window/idle changes; short sessions may have no saved activity yet.
9. Click **Pause browser tracking** or **Resume browser tracking** in the session page as needed. Finish the session, enter your self-rating, and review the activity summary. See **Analytics** for aggregate time and score.

**Important:** The extension is deliberately configured for the local backend on port **5000**, not for an arbitrary deployment. For another API host, edit the `BASE` constant in `extension/background.js` and `extension/popup.js`, add the specific host to `extension/manifest.json` host permissions, then reload the unpacked extension. Use HTTPS for remote deployment. The extension uses its **own scoped credential**, not the web login token.

**Privacy controls:** App Settings can turn off consent, revoke all paired extension tokens, and delete recorded activity. The extension popup can disconnect the current browser. YouTube and unrecognized sites are **Unknown** by default. Custom site rules accept bare domains such as `youtube.com` and apply to subdomains too. The tracker does not collect keystrokes, titles, full URLs, page content, passwords, or video. Existing optional camera processing remains local to the browser. Stored events contain a bare domain/category and timestamps only. Session pause and completion stop accepting new events. The extension's Chrome `tabs` permission is necessary to see active-tab domain switches.

## Productivity calculation

All activity categories are exclusive time intervals. Time is measured from accepted event timestamps, not the study-session timer. Unknown activity is **not** verified study time.

| Category | Contribution |
| --- | --- |
| Study, Coding, Reference | Study-related minutes |
| Entertainment, Gaming | Distraction minutes |
| Idle | Idle minutes |
| Unknown | Unknown minutes (not credited as study) |

With logged activity, the transparent score (0–100) is:

```
Activity quality = 100 × study-related minutes / all tracked minutes
Score = 0.50 × Activity quality
      + 0.25 × current topic mastery (BKT)
      + 0.10 × spaced-repetition readiness (SM-2, repetitions / 5 capped at 1)
      + 0.10 × recent exam/MCQ performance (up to five submitted attempts)
      + 0.05 × topic completion proxy (topics with mastery ≥ 0.80)
```

Missing learning signals are omitted and the available weights are renormalized. No activity events means **no activity-aware score**. Webcam scores have no weight in this score and disabling the camera **cannot reduce it**. BKT/SM-2 are still updated by the original end-of-session logic. Classifications are **rule-based proxies**, not proof that a website's content was truly educational; a domain alone cannot verify the intention of a video or page. Historical events retain their category at recording time when rules are later edited.

## Security and compatibility details

- Session start/end and the original `/api/sessions`, `/api/analytics`, `/api/auth`, scheduling and exam endpoints are retained. New endpoints are under `/api/activity`.
- Existing `User` and `StudySession` documents gain fields with safe defaults. New MongoDB models are `ActivityEvent` and `ActivityCredential`.
- Pair codes and extension credentials are random secrets stored **hashed** in MongoDB. Pair codes are one-use and ten-minute; extension credentials expire after 30 days or can be revoked in Settings.
- Each incoming event is checked for session ownership, live state, consent, type, date bounds and overlap. Duplicate event IDs are idempotent. Per-session event mutations are serialized in a **single Node process**.
- Deleting a subject or loading demo data also clears associated activity so reports do not retain orphaned entries.
- This is a **local single-server prototype**. For multi-server production scale, MongoDB transactions or stronger distributed interval coordination, request throttling, activity retention policy, and a deployed-extension origin allowlist need further work.

## Testing and limitations

**Passed here:** Six new `server/tests/activity.test.js` cases: YouTube/unknown classification, user overrides and subdomains, domain validation, duration accounting, score calculation and event-window validation. All JS/JSX source files passed a TypeScript parser-based syntax check; extension manifest passed JSON parsing.

**Not verified here:** Complete backend regression, frontend build, browser UI smoke tests, MongoDB integration, live socket connection and Chrome extension pairing. The combined server test command ran **6 passing new tests and 5 existing test suites blocked by missing dependencies** (`luxon`, `dotenv`, `jsonwebtoken`, etc.). The client test command ran **3 passing tests and 2 blocked by missing `zustand`**. The frontend build could not start because `vite` was unavailable. This execution environment could not retrieve npm packages (`registry.npmjs.org` DNS resolution failed), and an offline install lacked cached tarballs. No MongoDB or Chrome session was connected. **These blocked checks are not acceptance passes and do not prove a regression.**

Run on your computer after dependencies and MongoDB are configured:

```bash
npm test --prefix server
npm test --prefix client
npm run build --prefix client
```

Then perform the 9-step Chrome-extension walkthrough above, including duplicate event/overlap, pause/resume and consent disable checks. Compare all original features with the pre-upgrade ZIP if any regression appears.

## UI/UX implemented

- New responsive StudySync AI branded sidebar grouped into Workspace, Learning Insights and Account.
- Reworked login/registration screen with stronger visual hierarchy and real backend forms.
- Dashboard hero, improved statistic cards, working shortcuts and real tracked-activity highlight.
- Shared design system applied across **all existing pages** through the Page, Panel, button, input, spacing and theme styles; no existing screens removed.
- Functional light/dark switch with preference saved locally, mobile navigation and focus-visible keyboard states.
- New Settings pairing/consent/rules/history interface, Study focus-session monitoring controls and Analytics activity report.
- The original pages' functional layouts and chart sources are preserved, rather than rewritten without runtime verification. A fully bespoke re-layout of every exam and scheduler screen is **not claimed** in this prototype.
