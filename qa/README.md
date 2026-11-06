# Optional browser smoke test

Install server/client dependencies first (see the main README). With ports 5000 and 5173 free, run from the project root:

```bash
npm install --prefix qa --no-save playwright
npx --prefix qa playwright install chromium
node qa/browser-smoke.cjs
```

The harness starts its own frontend and mock socket server, intercepts API calls with synthetic data, and closes the servers afterward. It tests corrupted login storage, dashboard actions, token refresh, the exam flow and a demo-speed focus/session flow. It makes no MongoDB/Gemini requests. It requires a working Playwright Chromium installation. The original run used Playwright 1.51.1 with headless Chromium 134; browser versions can differ on your machine.

This is mocked browser verification, not a substitute for checking your own database and AI provider. Avoid running against an existing service on those ports.
