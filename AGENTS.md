# Ryqen Agent Operating Contract

## Start here

- Inspect `git status --short` and relevant diffs before editing. Preserve all
  existing user work; do not reset, revert, stash, or overwrite unrelated
  changes.
- Read the relevant approved documents before changing product or architecture:
  `docs/RYQEN_V0.1_ARCHITECTURE.md`, `docs/RYQEN_V0.1_DATA_MODEL.md`,
  `docs/RYQEN_V0.1_TODAY_SPEC.md`, and, when useful,
  `docs/RYQEN_PROJECT_CONTEXT.md`.
- Read the exact versioned Expo documentation at
  <https://docs.expo.dev/versions/v54.0.0/> before writing Expo or React Native
  code. Ryqen is currently on Expo SDK 54.
- Inspect the surrounding implementation and existing tests first. Make the
  smallest focused change that satisfies the approved task; do not perform
  unrelated rewrites or cleanup.

## Mission and V0.1 scope

Ryqen V0.1 is centered on the Today Command Center: help a user understand
what matters now, why it matters, and what to do next with minimal friction.
It uses structured work and deterministic, explainable planning. Preserve user
control, privacy, meaningful progress, and honest feedback over activity or
gamification.

Do not silently expand V0.1 into AI-driven mutation, calendar sync, recurring
work, background automation, cross-app control, a credits economy, social
features, or a generic settings/backlog system. Treat legacy Hunter features
as existing functionality to preserve unless a task explicitly changes them;
do not make `useHunterData` the permanent Today/planning layer.

## Technical stack and app conventions

- Expo SDK 54, React Native, React, and TypeScript; Android is an existing
  first-class target. Follow `app.json` and existing Expo configuration.
- Supabase provides Auth, Postgres, Storage, and RLS-protected data access.
- Screens live in `src/screens`; reusable UI in `src/components`; use the
  existing theme tokens from `src/constants/theme.ts` rather than hard-coded
  colors or typography.
- Preserve the project local-date convention: use
  `toLocaleDateString('en-CA')` for local `YYYY-MM-DD` dates where the existing
  code does so. Do not introduce timezone infrastructure without approval.
- Do not change package versions or add dependencies without a concrete,
  approved need. Native dependency/config changes may require an appropriate
  development-build rebuild; do not assume Expo Go support.

## Required architectural boundaries

Use the existing direction:

`UI/screens/components -> hooks/application service -> domain -> repository/data -> Supabase`

- UI presents state and sends user intent. It must not contain planner rules or
  direct Supabase mutations for Ryqen business data.
- Hooks coordinate React state, availability, and recovery; application
  services coordinate use cases; domain code owns deterministic validation,
  selection, transitions, and formatting; repositories own Supabase queries,
  RPC calls, and row mapping.
- Daily Plans and Plan Items are date-scoped snapshots. Persistent Actions are
  the source of truth for work and lifecycle state. Do not place historical
  lifecycle anchors into the current plan snapshot.
- Keep the approved Today behavior intact unless explicitly changing it:
  Active/Paused/Deferred work remains distinct from fresh recommendations, and
  the maximum of three applies to fresh recommendations only.

## Deterministic logic and AI

V0.1 planning, lifecycle validation, eligibility, ranking, and important
mutations are deterministic. AI is not an authority and must not directly
mutate important state. Any future AI proposal must be structured, schema- and
business-validated, authorized, and auditable before execution.

Do not move the planner into UI or SQL merely for convenience. Database
reconciliation enforces the approved persistence/security invariants; domain
planning owns contextual ranking and selection.

## Mutation, authorization, and audit rules

- Preserve RLS and per-user ownership. Do not accept a client-supplied user ID
  as authorization for a sensitive operation.
- Meaningful Today lifecycle changes go through the established protected RPC
  boundary, not direct client status mutations. The server validates auth,
  ownership, expected state, and related records, then performs atomic changes
  and required Activity writes.
- Direct client writes to lifecycle Plan Items and Activities are prohibited.
  Do not weaken restricted Action column privileges or broad table grants.
- For protected `SECURITY DEFINER` functions, preserve explicit `auth.uid()`
  rejection/ownership checks, `SET search_path = ''`, schema-qualified objects,
  least-privilege grants, and authenticated-only execution. Do not rely on RLS
  as the function's authorization check.
- Preserve the lifecycle lock order when overlapping rows are locked:
  `Action -> Daily Plan -> Plan Item`. Do not introduce automatic lifecycle
  replays or fake success in the client.
- Preserve Activity as an audit record. Never fabricate an Activity, quest,
  XP award, or completion merely to populate a UI.

## Supabase and secrets safety

- Use additive, timestamped migrations for approved schema/RPC/policy changes.
  Never rewrite an already-applied migration. Stop for approval if a concrete
  schema gap expands the agreed scope.
- Local Supabase testing, linting, and migration inspection are allowed when
  relevant to the task and repository workflow. Do not reset databases unless
  explicitly authorized.
- Never alter hosted Supabase, link a project, apply hosted migrations, or run
  destructive/backend commands merely because access is available. Hosted
  changes require explicit user approval and a reviewed command/scope.
- Never expose, log, commit, or copy `.env` contents, service-role keys,
  database URLs, tokens, or other credentials. Mobile clients must not use
  service-role credentials.

## Testing and validation

- Start with the narrowest relevant test, then run broader checks in proportion
  to risk. Register new tests in `tests/run.mjs` when the suite requires it.
- Standard checks, when relevant:

  - `npm test`
  - `npx tsc --noEmit`
  - `git diff --check`
  - `npx supabase db lint --local` for Supabase changes when local services are
    available
  - `RYQEN_RUN_LOCAL_SUPABASE_INTEGRATION=1 npm test` for relevant local
    integration coverage

- Inspect test output. Never claim a check passed if it was not run; clearly
  report skipped or unavailable local infrastructure.

## Git, documentation, and decision handling

- Keep branches and commits focused. Do not stage, commit, push, amend, reset,
  or discard work unless the user explicitly requests that action.
- Before modifying, inspect status and avoid touching unrelated dirty files.
  Before handoff, review the diff and report exactly what changed.
- Update the relevant approved documentation when an approved product,
  architecture, data-model, security, or operational decision genuinely
  changes. Keep documentation concise and aligned; do not invent a second
  architecture or duplicate the source documents.
- If code, migrations, tests, and approved documents conflict, do not silently
  choose a new product rule. Identify the concrete conflict, preserve safety,
  and request/record an explicit decision before making a material change.

## Agent behavior

Inspect first, make focused changes, preserve working behavior unless the task
explicitly changes it, and validate the result honestly. Prefer a small
well-tested correction over a speculative abstraction or V0.2 capability.
