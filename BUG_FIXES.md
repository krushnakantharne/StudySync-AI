# Corrected Adaptive Study Scheduler

Reviewed and corrected on 30 October 2026. This is a source-code ZIP; extract into a fresh folder and follow README.md. Your database is not included or modified by this archive.

## Bugs corrected

### Exams
- **Answer leakage:** generation hid answer keys, but history/detail endpoints returned them for unsubmitted attempts. All attempt responses now share the same redaction rule.
- **Inflated scores:** duplicate entries for a question could award points repeatedly. Answers are validated and grading counts each stored question once.
- **Invalid submissions:** malformed answer lists, unknown question IDs, fractional/out-of-range option indexes and string indexes now return HTTP 400.
- **Submission race:** submission uses an atomic ownership, expiry and unsubmitted-state filter, preventing concurrent re-submission from overwriting a completed attempt.
- **Invisible deadline:** the exam screen now shows a countdown, disables answering/submission after expiry, and offers a new attempt.
- **No repeat flow:** a completed exam now has a “Take another exam” action.
- **History calculations:** score comparisons use percentages when exams have different lengths. Zero-accuracy topics and unanswered questions are included in weakness detection.
- **Route collision:** calendar exam events now have a separate `/api/exam-events` endpoint. `/api/exams` continues to list attempts; legacy POST `/api/exams` remains available for calendar creation.

### Study and focus
- **Foreign schedule linkage:** starting a session now verifies the linked schedule item's owner, subject, topic, status and type. A session can no longer reference another user's schedule item.
- **Missing topics:** sessions cannot start for arbitrary topic names; duplicate topic names are rejected.
- **False completion:** ending an incomplete session marks its linked schedule item skipped rather than done.
- **Invalid duration:** study length is limited to 5–90 minutes; actual time is validated before mastery changes. A zero-minute session no longer silently becomes one minute.
- **Double finalization:** repeated completion requests are serialized within one API process and re-check the saved session state.
- **Camera startup race:** focus tracking starts after the video element mounts. A delayed camera permission/model response cannot restart a camera after the tracker has stopped. Failed model loads can be retried.
- **Timer drift:** elapsed study time uses wall-clock timestamps, avoiding lost time from throttled background intervals.
- **Lost or invalid focus readings:** focus messages validate raw scores and window indexes, check session ownership/active status, acknowledge buffering/flushes, serialize per-session writes and retain failed flushes for retry. Upserts avoid duplicate windows when retried.
- **Final focus race:** the UI waits for final focus acknowledgements before requesting a session summary, and reports failures.
- **Origin mismatch:** REST and Socket.IO use the same configured development/production origin policy.

### Scheduler and data
- **Review overload:** exam reviews now count against daily study minutes and session limits; remaining normal-study slots can be shortened to fit small daily goals.
- **Past start times:** rounding includes seconds, so a generated block cannot start before the current moment.
- **Overlapping regeneration:** active sessions and retained future items reserve time and budget. Regeneration requests are serialized within one API process.
- **Expired exam mode:** expired exam-mode subjects can return to normal planning instead of disappearing from plans; reviews cannot extend beyond the exam time.
- **Orphan data:** subject deletion removes associated exam attempts, questions, sessions and focus records; active sessions block deletion. Demo reset also clears the old account's attempts/question bank. Removing a topic clears its stale planned blocks.
- **Input crashes:** malformed topic lists, blank names, invalid numeric types, fractional integer fields, invalid date ranges and negative query limits now receive validation errors.

### AI, login and interface
- **Infinite loop:** negative Gemini batch size could make the generation loop run indefinitely. Batch size and timeout settings are bounded with safe defaults.
- **Malformed AI questions:** blank text, invalid answer indexes, non-string/blank/duplicate options and off-topic entries are rejected. Duplicate bank/AI questions are filtered.
- **Login crashes:** corrupt or inaccessible browser storage no longer crashes startup or authentication changes.
- **Expired-token handling:** protected `/auth/me` requests can refresh and retry; a refresh result cannot restore a session after logout/account change.
- **Invalid authentication input:** account fields and password types are validated, email whitespace is normalized, invalid timezones/settings are rejected, and refresh checks that the account still exists.
- **Missing dashboard action:** the shared Panel component now renders the Weekly Exam action button.
- **Hidden errors:** data-loading, survey and schedule-action failures are shown instead of being silently dropped.
- **Broken setup:** added the missing server `.env.example`, a cross-platform `setup.mjs` that creates missing configs with fresh secrets, and corrected installation instructions. Old builds, credentials and OS-specific dependencies are not included.

## Verification

- Original backend baseline: 9 passing tests.
- Corrected backend: 33 passing tests, including real HTTP and Socket.IO transports with isolated model/persistence stubs, plus algorithm, grading, validation and AI-output regression tests.
- Corrected client: 5 passing tests for face absence, focus cleanup, delayed camera permission, corrupt login storage and disabled browser storage.
- Production frontend build: passed with the existing large-bundle warning from TensorFlow/Recharts. No build errors.
- Live MongoDB integration could not run here: the temporary MongoDB process was blocked by the execution environment (`Operation not permitted`). No connection to the uploaded project's configured database was attempted.
- Gemini requests were mocked; no live API key or paid request was used. Actual provider availability, quota and model configuration require a local check.
- Browser smoke: 6 checks passed with Chromium, mocked API data and a mock focus socket, with no uncaught browser errors. The reproducible harness is in `qa/`.
- Physical webcam/model inference requires a camera and network access for model assets. The automated camera test covers delayed permission cleanup, not real face-detection accuracy.

## Remaining boundaries

This is not a claim that every possible defect has been eliminated. The app remains a student/demo project. Its cross-document session updates, schedule locks and in-memory focus buffers assume one API process; production deployments with multiple API instances need shared locking/transactions and durable focus queues. Reloading/leaving an active exam or study session does not yet restore its in-progress UI. Excess review demand can remain unscheduled when the daily goal or preferred hours are full.

Run `node setup.mjs`, install both folders with `npm ci`, and set your own MongoDB/Gemini configuration before running. Do not merge in the old `node_modules` or `dist` directories.
