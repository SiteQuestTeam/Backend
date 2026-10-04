# Live Data, Admin API, and KCK UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove runtime mock data from the SideQuest app, provide a protected HTTP administration API and local CLI, and repair the KCK preparation screen layout.

**Architecture:** Prisma-backed public resources remain the app's only runtime source. A separate `/admin` module wraps validated, server-owned administration operations behind an enable flag and Bearer token. The untracked CLI only calls this API. The KCK loading screen separates its full-width header from a centered content body.

**Tech Stack:** NestJS, Prisma 6 with SQLite, Expo/React Native, Node built-in test runner, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-04-live-data-and-admin-api-design.md`

## Global Constraints

- Do not run Prisma seed automatically; only the explicit CLI creates presentation records.
- The public app contains no local initiative, reward, AI-question, or demo-player records.
- `/admin` is unavailable unless `ADMIN_API_ENABLED=true` and every request needs `Authorization: Bearer ${ADMIN_API_TOKEN}`.
- `ADMIN_API_TOKEN` stays in backend secrets and the untracked CLI `.env`; it never appears in App source, committed `.env`, or responses.
- Votes, points, status changes, and KCK confirmation follow server rules; never accept calculated values directly from admin input.
- Only Initiatives are map items; City Incidents remain separate and unvoteable.
- Do not change nontechnical README content or commit Docker/deployment/secrets files.
- The local admin CLI must live at `C:\workspace\admin-cli` and remain untracked.

## Review Focus

- Missing/incorrect admin token must return `401`, while disabled administration returns `404`.
- Creating data in the CLI must be reflected by public endpoints without restarting the backend or app.
- Direct `votesCount`, rank, balance and external `kckIncidentId` edits must be rejected.
- Empty public collections must render empty states rather than mock cards.
- KCK loading on a narrow viewport must retain a full-width header and centered body.

---

### Task 1: Administration configuration and guard

**Files:**
- Create: `Backend/src/admin/admin-access.guard.ts`
- Create: `Backend/src/admin/admin-access.spec.ts`
- Create: `Backend/src/admin/admin.module.ts`
- Modify: `Backend/src/app.module.ts`
- Modify: `Backend/.env.example`

**Interfaces:**
- Produces `AdminAccessGuard`, applied at the controller level.
- Requires environment variables `ADMIN_API_ENABLED` and `ADMIN_API_TOKEN`.

- [ ] **Step 1: Write failing guard tests**

```ts
test('rejects a missing or invalid Bearer token with 401');
test('hides the endpoint with 404 when ADMIN_API_ENABLED is not true');
test('allows a matching Bearer ADMIN_API_TOKEN');
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/admin/admin-access.spec.ts`

Expected: FAIL because the guard does not exist.

- [ ] **Step 3: Implement `AdminAccessGuard`**

Read only `process.env`. Return `NotFoundException` for disabled administration, `UnauthorizedException` for absent/malformed/incorrect authorization, and allow exactly `Bearer ${ADMIN_API_TOKEN}` when enabled.

- [ ] **Step 4: Register `AdminModule` and document only the technical variables in `.env.example`**

Keep token values as placeholders. Do not supply a default token.

- [ ] **Step 5: Run the focused tests and backend suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin src/app.module.ts .env.example
git commit -m "feat: protect administration API access"
```

### Task 2: Administrative Players and Rewards API

**Files:**
- Create: `Backend/src/admin/admin.controller.ts`
- Create: `Backend/src/admin/admin.service.ts`
- Create: `Backend/src/admin/admin.dto.ts`
- Create: `Backend/src/admin/admin-players-rewards.spec.ts`
- Modify: `Backend/src/points/points.service.ts` if a validated point-adjustment entry point is absent

**Interfaces:**
- Consumes: `AdminAccessGuard`, `PrismaService`, `PointsService`, `PlayersService`.
- Produces:
  - `GET|POST /admin/players`, `PATCH /admin/players/:id`, `POST /admin/players/:id/points`
  - `GET|POST /admin/rewards`, `PATCH|DELETE /admin/rewards/:id`

- [ ] **Step 1: Write failing integration-style service/controller tests**

```ts
test('creates and lists a player through administration');
test('adjusts points by adding a PointTransaction and updates both balances');
test('lists inactive rewards for administration but not for GET /rewards');
test('refuses reward deletion after redemption');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/admin/admin-players-rewards.spec.ts`

Expected: FAIL because resources are missing.

- [ ] **Step 3: Implement DTO validation and service methods**

Use transactions. Point adjustment accepts only signed `amount`, `reason`, and optional reference; it creates the ledger entry and updates `pointsBalance` plus `totalPointsEarned` only for positive awards. Do not expose direct balance/rank setters.

- [ ] **Step 4: Implement controller endpoints with shared public DTO mapping**

Return the same Player/Reward response shapes used by the app where available. Expose inactive rewards only via `/admin/rewards`.

- [ ] **Step 5: Run focused and full backend tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin src/points
git commit -m "feat: manage players and rewards through admin API"
```

### Task 3: Administrative Initiatives, Votes, and KCK records

**Files:**
- Modify: `Backend/src/admin/admin.controller.ts`
- Modify: `Backend/src/admin/admin.service.ts`
- Create: `Backend/src/admin/admin-initiatives.spec.ts`
- Modify: `Backend/src/initiatives/initiatives.service.ts` only for reusable, transactional administration helpers
- Modify: `Backend/src/kck/kck.service.ts` only for safe read/update projection helpers

**Interfaces:**
- Consumes: Task 1 guard and Task 2 service.
- Produces:
  - `GET|POST|PATCH|DELETE /admin/initiatives`
  - `GET /admin/initiatives/:id/votes`, `POST /admin/initiatives/:id/votes`, `DELETE /admin/votes/:id`
  - `GET /admin/kck/incidents`, `GET|PATCH /admin/kck/incidents/:id`

- [ ] **Step 1: Write failing tests for invariants**

```ts
test('does not accept votesCount or status in an initiative update');
test('casts an admin vote by calling the normal proximity and duplicate-vote rule');
test('deleting a vote recalculates Initiative votesCount and passed status transactionally');
test('does not allow PATCH to set kckIncidentId or pointsGrantedAt');
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/admin/admin-initiatives.spec.ts`

Expected: FAIL because the endpoints and service operations do not exist.

- [ ] **Step 3: Implement initiative administration**

Allow editable presentation fields: location, title, category, brief fields, threshold, fixer, place and stored photo URI. New initiatives must reference an existing Player and use normal validation. Delete through Prisma relation semantics.

- [ ] **Step 4: Implement vote and KCK administration with domain constraints**

Use `InitiativesService.vote` for casting. For deletion, derive counts/status from persisted votes in one transaction and do not reverse historic PointTransactions. Permit KCK display-text/status maintenance only; no fabricated external acknowledgement or points award.

- [ ] **Step 5: Run focused and full backend tests**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin src/initiatives src/kck
git commit -m "feat: manage presentation records through admin API"
```

### Task 4: Remove app domain mocks and consume only public API data

**Files:**
- Delete: `App/src/data.ts`
- Modify: `App/src/mapHtml.ts`
- Modify: `App/App.tsx`
- Modify: `App/src/screens/TabScreens.tsx`
- Create: `App/src/live-data.ts`
- Create: `App/tests/live-data.test.mjs`
- Modify: `App/package.json`

**Interfaces:**
- Consumes: public API result types from `App/src/api.ts`.
- Produces `emptyCollectionState(items)` and a map fallback coordinate constant that is geographic UI configuration, not a domain record.

- [ ] **Step 1: Write failing App tests**

```js
test('returns an empty state for no initiatives instead of sample initiatives');
test('returns an empty state for no rewards instead of sample rewards');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:contracts`

Expected: FAIL because the live-data helper does not exist.

- [ ] **Step 3: Implement live-data helpers and remove `src/data.ts`**

Keep a standalone Kraków map-centre fallback in `mapHtml.ts`, but delete all mock Initiatives, Rewards and AI questions. Remove the `Gracz Demo` runtime fallback and make sign-in start with an empty nickname.

- [ ] **Step 4: Render explicit app empty states**

Map, initiative list and rewards display a short empty-state message and action where appropriate. Request failures retain existing error/retry UI; no fallback domain records are introduced.

- [ ] **Step 5: Run test and Expo export**

Run: `npm run test:contracts && npm run web:build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add App.tsx src package.json
git commit -m "feat: load all app domain data from API"
```

### Task 5: Repair the KCK preparation screen layout

**Files:**
- Modify: `App/src/screens/IncidentScreen.tsx`
- Create: `App/src/kck-preparation-layout.ts`
- Create: `App/tests/kck-preparation-layout.test.mjs`
- Modify: `App/package.json`

**Interfaces:**
- Produces `preparationStatus(copyInput)` returning either location or AI analysis copy.

- [ ] **Step 1: Write failing state-copy tests**

```js
test('uses location copy before coordinates are available');
test('uses analysis copy after coordinates are available');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:contracts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Separate KCK header and centered preparation body**

Render `ScreenHeader` as a direct full-width child of the screen. Put the spinner and copy in a nested body view with `flex: 1`, centered alignment and readable width. Preserve the existing back action and the distinction between location and image analysis.

- [ ] **Step 4: Run test and Expo export**

Run: `npm run test:contracts && npm run web:build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/IncidentScreen.tsx src/kck-preparation-layout.ts tests/kck-preparation-layout.test.mjs package.json
git commit -m "fix: align KCK preparation screen"
```

### Task 6: Create the untracked HTTP administration CLI

**Files:**
- Create, untracked: `C:\workspace\admin-cli\package.json`
- Create, untracked: `C:\workspace\admin-cli\src\index.mjs`
- Create, untracked: `C:\workspace\admin-cli\.env.example`
- Create, untracked: `C:\workspace\admin-cli\README.md`

**Interfaces:**
- Consumes `ADMIN_API_URL`, `ADMIN_API_TOKEN` and Task 2/3 `/admin` endpoints.
- Produces exit code `0` on success and a non-zero exit code for API, validation, or transport errors.

- [ ] **Step 1: Write a failing CLI request test with a local HTTP fixture**

```js
test('sends ADMIN_API_TOKEN as a Bearer header');
test('prints API errors and exits non-zero');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because the CLI request client is absent.

- [ ] **Step 3: Implement command parsing and HTTP client**

Implement `players`, `initiatives`, `votes`, `rewards`, and `kck` command families from the spec. Read the local `.env`; never write the secret to output. JSON input may be passed as a file path or stdin.

- [ ] **Step 4: Add the local `.gitignore` and verify the CLI is untracked**

Keep the whole directory absent from both repository indexes. Do not add it to either Git repository.

- [ ] **Step 5: Run CLI tests against a local fixture and a running local backend**

Run: `npm test` in `C:\workspace\admin-cli`, then create/list a temporary player through `http://127.0.0.1:<port>/admin/players`.

Expected: PASS; no CLI files appear in `git status` for App or Backend.

### Task 7: End-to-end verification and handoff

**Files:**
- Modify: only files discovered as necessary by test fixes.

- [ ] **Step 1: Start Backend with a fresh temporary SQLite path and admin environment**

Run Prisma schema deploy, set `ADMIN_API_ENABLED=true` and a temporary `ADMIN_API_TOKEN`, then start the API.

- [ ] **Step 2: Verify public and administrative data lifecycle**

Use CLI HTTP commands to create a Player, Reward and Initiative; verify public `GET /initiatives` and `GET /rewards` expose them. Verify invalid token receives `401`, disabled admin receives `404`, and data remains after restart.

- [ ] **Step 3: Verify app contracts and UI exports**

Run: `npm run test:contracts && npm run web:build` in App; run Backend `npm test && npm run typecheck && npm run build`.

- [ ] **Step 4: Inspect Git state and push meaningful commits**

Verify both repositories are clean, commits are authored as Patryk Rusak, and push each completed commit to `origin main`. Confirm `C:\workspace\admin-cli` remains untracked.

## Self-review

- Spec coverage: Tasks 1–3 implement the protected administration contract and domain constraints; Task 4 removes runtime mocks; Task 5 covers the additional KCK layout requirement; Task 6 implements the untracked HTTP CLI; Task 7 proves persistence and contracts.
- Type consistency: the plan names only `AdminAccessGuard`, `/admin` endpoints, public resource types and helper functions defined by the corresponding tasks.
- Review focus coverage: Task 1 covers access, Tasks 2–3 cover calculated-data and rule enforcement, Task 4 covers empty states, and Task 5 covers KCK layout.
- Scope: Docker, deployment configuration, nontechnical README content, mobile authentication, and direct SQLite administration are explicitly excluded.
