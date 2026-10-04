# Live data and administration API design

## Goal

Make the backend the sole source of runtime data for SideQuest. The mobile application must not display local mock initiatives, rewards, AI questions, or a demo player. It must obtain live records through the public API and render explicit empty or unavailable states instead of fallback content.

Provide a local, untracked HTTP CLI for presentation administration. The CLI must manage presentation data through protected backend endpoints; it must never open or mutate SQLite directly.

## Project rules applied

- Only Initiatives appear on the map and participate in votes.
- A Vote requires the voter to be within 50 metres and remains one per Player and Initiative.
- Points, status transitions, and vote counters are server-owned business rules.
- City Incidents are the separate KCK workflow. They do not appear as voteable map items.
- A KCK incident grants points only after a confirmed KCK `incidentId`.
- Production data is persistent in `/app/data`; seed data is never run automatically.

## Runtime data flow

```text
App ──public API──> Backend + Prisma SQLite
CLI ──admin API───> Backend + Prisma SQLite
```

The public endpoints remain the app contract. The App loads Players, Initiatives and Rewards from these endpoints after sign-in and after mutations. The map, initiative list, detail screen, rewards, and profile consume that API state.

The App removes its local sample data module and demo-player fallback. A failed request is reported to the user; an empty response renders an empty state.

## Public API contract

The existing public resources remain authoritative:

- `POST /players/session`, `GET /players/:id`, `GET /players/:id/history`
- `GET|POST /initiatives`, `GET /initiatives/:id`, `POST /initiatives/:id/votes`
- `POST /photos`, `GET /photos/:folder/:file`
- `GET /rewards`, `POST /rewards/:id/redeem`
- KCK preparation, submission, interest and photo endpoints

The app owns no initiative, reward, vote or player sample records. It preserves live GPS fallback only as a location UX state; it does not manufacture geographic domain data.

## Administration API

Administration endpoints are nested under `/admin`. They are disabled unless `ADMIN_API_ENABLED=true` and require:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
```

`ADMIN_API_TOKEN` is a required production secret. It is never returned in API responses, committed to source control, put in the mobile app, or embedded in the CLI.

An absent or invalid Bearer token returns `401 Unauthorized`. An inactive admin API returns `404 Not Found` to avoid exposing an inactive management surface.

Resources and allowed operations:

| Resource | Administration operations |
| --- | --- |
| Players | list, get, create, update nickname, adjust points with a ledger entry |
| Initiatives | list, get, create, update editable presentation fields, delete |
| Votes | list by initiative, create through the regular vote rule, delete with a transactional counter recalculation |
| Rewards | list including inactive, create, update, activate/deactivate, delete only when no redemption exists |
| KCK incidents | list, get, update presentation-safe status and text fields; never fabricate a successful external KCK confirmation |

Admin create/update responses use the same public DTO mappers wherever applicable. The API does not accept direct edits of calculated `votesCount`, point balances, ranks, or an externally issued KCK incident identifier.

## CLI

`C:\workspace\admin-cli` is intentionally ignored by Git and contains no application source. It is a small Node CLI whose `.env` has:

```env
ADMIN_API_URL=https://api.example.invalid
ADMIN_API_TOKEN=replace-me
```

It sends the Bearer token for every request and provides commands such as:

```text
players list | create | update | adjust-points
initiatives list | create | update | delete
votes list | cast | delete
rewards list | create | update | activate | deactivate | delete
kck list | get | update
```

The CLI is a presentation tool, not a second business-logic implementation. It prints API errors and exits non-zero on failure.

## Data lifecycle

- The database starts empty and Prisma creates its schema at container startup.
- No automatic seed runs at build or container startup.
- Demonstration records are created explicitly through the CLI.
- Existing persistent records are retained across deployments.
- Deleting an Initiative uses its existing relation semantics and recalculates or removes dependent vote state transactionally.

## Error handling

- App: empty collection -> designed empty state; request error -> retryable error state; never fabricated data.
- Admin API: validation errors -> `400`; missing resource -> `404`; invalid token -> `401`; disabled API -> `404`; broken business rule -> existing `409` or `403` semantics.
- KCK: no admin action may claim that an external incident was accepted unless the actual client returned an `incidentId`.

## Verification

1. Fresh database has no public initiatives or rewards until they are created deliberately.
2. CLI creates a player, initiative and reward through HTTP; the App receives and displays them after refresh.
3. Admin endpoint rejects missing and invalid tokens, and is unavailable while disabled.
4. A normal vote follows the 50-metre and one-vote rules; an admin vote calls the same rule.
5. Deleting or editing administration records preserves database consistency.
6. Existing KCK and app contract tests, TypeScript build, API integration tests, and Expo web export pass.
