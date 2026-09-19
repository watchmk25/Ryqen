# Ryqen V0.1 Architecture

**Status:** Approved  
**Version:** V0.1

## 1. Purpose

Ryqen is a long-term personal intelligence and action layer. V0.1 is intentionally narrower: help people organize life/work and decide what matters next.

The core V0.1 experience is the **Today Command Center**, powered by an adaptive daily plan based on the user's actual circumstances.

## 2. Core Principles

- Progressive, minimal onboarding.
- Meaningful value immediately.
- Goal/context-driven rather than rigid feature categories.
- Optimize meaningful progress and reduced friction.
- Proactive but restrained.
- Unified intelligence with specialized AI/tools available as future capabilities.
- User control, honesty, safety, privacy, respect, and autonomy remain fundamental.
- Goals, Projects, Tasks, and Actions are distinct; standalone Actions are allowed.
- Prioritization considers importance, urgency, goal impact, effort, available time, capacity, dependencies, and preferences.
- Prioritization should be explainable.
- Current V0.1 Today planning is deterministic and does not depend on AI.
- A future AI reasoning/personalization layer must produce structured, validated proposals.
- Preserve a provider abstraction for that future layer without making a provider a V0.1 runtime dependency.
- Meaningful actions require appropriate authentication, authorization, validation, verification, and auditing.

## 3. Core Architecture

```text
User
  |
  v
Context + Goals + Projects + Tasks/Actions
  |
  v
Planning Engine
  |   |  \-- Deterministic business rules (current V0.1)
  |
  \---- Future AI reasoning/personalization
  |
  v
Adaptive Daily Plan
  |
  v
Today Command Center
  |
  v
User Action
  |
  v
Observed Result / Progress
  |
  v
Updated Context
```

The long-term loop is:

**Understand → Plan → Act → Observe → Adapt**

## 4. Architectural Layers

### Presentation

Screens and components render state and collect user intent. They should not contain important business rules.

### Application

Coordinates use cases such as loading context, requesting plans, applying validated actions, and recording results.

### Domain

Contains deterministic rules for prioritization, validation, state transitions, progress, capacity, dependencies, and permissions.

### Data

Owns Supabase access, persistence, queries, transactions, and mapping database records to domain models.

### AI

Reserved for future reasoning, personalization, interpretation, structured recommendations, and explanations. It is not required for the current V0.1 Today planner.

**AI never directly mutates important application state.**

The required flow is:

```text
AI proposal
 -> schema validation
 -> business-rule validation
 -> permission/authorization checks
 -> state change
 -> audit/result
```

## 5. Core Domain Model

### User
Authenticated owner of Ryqen data.

### Context
Relevant current circumstances, constraints, preferences, available time, and other useful context.

### Goal
A meaningful outcome the user wants to achieve.

### Project
A body of related work contributing to a Goal.

### Task
A meaningful piece of work that may contain one or more Actions.

### Action
A concrete next step. Actions may exist independently.

### Daily Plan
The adaptive, date-scoped snapshot of recommended work/actions for the current circumstances. Persistent Actions remain the source of lifecycle truth; cross-day Active Work, Paused Work, and Deferred Work may use historical Plan Items only as validated lifecycle/audit anchors.

### Activity / Progress
Durable records of meaningful lifecycle work or progress. V0.1 exposes a
small, read-only **Recent activity** view from Profile, interpreted from the
existing owner-scoped `activities` table. It allow-lists meaningful Action
lifecycle events (Started, Paused, Resumed, Completed, Deferred, and Skipped)
while hiding technical Plan Item lifecycle records. Completion rows may show
the existing deterministic target/active/delta metadata. This is a user-facing
interpretation, not an internal audit/security log, analytics dashboard, or a
new persistence model; no schema change is required.

## 6. Planning Engine

The planning engine is the central V0.1 capability.

It should consider:

- importance
- urgency
- goal impact
- effort
- available time
- capacity
- dependencies
- preferences
- current context

It should explain recommendations, for example:

> Recommended first because it has high goal impact, is time-sensitive, and fits the available time.

The current V0.1 pipeline is:

```text
Context
 -> deterministic preparation
 -> deterministic priority selection and explanation
 -> Daily Plan
```

Future AI may handle ambiguity and personalization through a structured proposal that deterministic code validates before it affects a plan. Deterministic code continues to enforce hard constraints and state integrity.

## 7. Today Command Center

The primary V0.1 surface should answer:

1. What matters today?
2. Why does it matter?
3. What should I do next?

It should adapt to circumstances rather than forcing users through fixed feature categories.

The interface should remain calm and focused. Ryqen should not maximize cards, notifications, metrics, quests, or activity.

## 8. Future AI Provider Strategy

Current V0.1 does not invoke an AI provider for Today planning. The following provider direction is retained for a later, separately approved reasoning/personalization layer.

Internally, use an abstraction such as:

```text
Ryqen AI Interface
  -> Primary provider
  -> Future provider
  -> Future specialized capability
```

AI responses should map to explicit schemas such as a future `PlanProposal` containing recommendations, rationale, effort estimates, assumptions, and warnings.

Exact schemas are defined in the data-model/API phase.

## 9. Security and Permissions

Supabase Auth remains the V0.1 authentication foundation.

Supabase Row Level Security should enforce user ownership.

Important state transitions are validated independently of UI and future AI input.

### Implemented Today lifecycle boundary

Meaningful Today lifecycle mutations use protected Supabase RPC boundaries. Those functions authenticate through `auth.uid()`, explicitly verify record ownership, validate the expected state transition, perform related writes atomically, and record lifecycle Activities atomically where the transition requires them.

Pause is a persisted lifecycle state, distinct from Defer: `in_progress -> paused -> in_progress`. A Pause preserves its historical Plan Item anchor, removes the Action from Active Work and fresh recommendations, and requires explicit Resume. `actions.started_at` marks only the current open active session; `actions.accumulated_active_seconds` stores previously closed active sessions. Pause and active Defer flush the open session server-side and clear `started_at`; Resume opens a new session while preserving accumulated time; Complete flushes and persists the final total. Pause/Resume patch Today from the authoritative RPC response and do not run a planner reconciliation solely for that state change. Defer instead moves work out of the immediate context and requires explicit Reconsider before it can become pending again.

Authenticated clients cannot directly write Activities or mutate Plan Items. Direct Action updates are limited to ordinary planning fields; lifecycle fields such as Action status and `started_at` remain RPC-controlled. The protected functions are `SECURITY DEFINER`, run with an empty `search_path`, and retain explicit `auth.uid()` and ownership checks rather than relying on definer privileges or RLS as the authorization decision.

### Today lifecycle/reconciliation lock order

Within the implemented Today lifecycle and reconciliation paths, overlapping rows are acquired in this order:

```text
Action -> Daily Plan -> Plan Item
```

This shared order avoids the Action/Daily Plan lock-order inversion that could otherwise produce a PostgreSQL deadlock. It is a scoped invariant for these Today paths, not a general database-wide locking rule.

### Reconciliation eligibility boundary

The deterministic planner remains responsible for context-driven exclusions, time/capacity fit, ranking, and selecting at most three fresh recommendations. The reconciliation RPC enforces only the persistent eligibility boundary for a pending Plan Item: the Action belongs to the authenticated user and is `pending`; a linked Task is `pending` or `in_progress`; and relevant direct, Task-derived, or Project-derived Projects and Goals are `active`.

Reconciliation cannot use an invalid lifecycle Action to create a fresh pending snapshot and does not create Activities.

### Hosted backend compatibility

The Today client requires the authenticated read-only backend contract RPC
`ryqen_today_backend_contract`, currently contract version `3`, before it
loads plans or requests a Today mutation. This is a safety net that presents a
clear backend-update message when the endpoint is absent or its version is
unsupported; ordinary network/request failures remain ordinary Today refresh
failures. It does not replace deployment discipline.

Mobile clients never run Supabase migrations. Before hosted or physical-device
backend testing, verify that local and remote migration histories match with
`npm run supabase:migration-drift` using `SUPABASE_DB_URL`. Local and remote
databases can diverge, and the check is intentionally manual/read-only: it
never applies a migration. Bump the contract version only for a backend API
change that requires a newer client/backend contract, not for unrelated or
backward-compatible migrations.

Capabilities affecting external systems, user data, or important state require explicit permission boundaries.

Meaningful operations should eventually record enough audit information to understand what was requested, what occurred, which permission was used, and whether it succeeded.

## 10. Supabase Direction

The existing Supabase schema is a working foundation, not the final Ryqen domain model.

The current schema is strongly influenced by the previous Hunter/quest product and must not dictate the new architecture.

The V0.1 model now includes structures for:

- goals
- projects
- tasks
- actions
- context
- daily plans
- plan items
- activity/progress

The approved relational details are documented in `RYQEN_V0.1_DATA_MODEL.md` and incremental Supabase migrations. Future model changes remain subject to the same additive, reviewed migration discipline.

Important historical values should not rely solely on mutable aggregates. For example, progression/XP should eventually use an event/ledger approach rather than reconstructing lifetime XP from today's quests.

Future real-world credits must remain separate from gamification/progression.

## 11. Frontend Direction

The existing Expo application should be evolved rather than rewritten.

Target flow:

```text
Screens
  -> application actions/hooks
  -> domain/application services
  -> Supabase / AI
```

The existing `useHunterData` hook should not become Ryqen's permanent brain. Its responsibilities should be separated gradually.

## 12. Migration Strategy

The existing Hunter terminology, quests, XP, character/rank concepts, stat personalization, onboarding/assessment, and central hook are treated as legacy product structure.

### Approved Decision — Legacy Hunter Assessment Is Non-Blocking

The legacy Hunter Strength, Intelligence, Vitality, Agility, and Endurance assessment is **not** a V0.1 launch prerequisite. An authenticated user who has completed onboarding must be able to reach Home and the Today Command Center without completing that assessment.

`hunter_abilities.assessment_complete` remains preserved legacy data. The launch gate must not infer V0.1 incompletion from it, and must not repair, reset, or fabricate assessment completion state merely to allow V0.1 access. Existing assessment data remains editable and the assessment may remain available for legacy, profile, and personalization purposes.

The assessment is not required by Today, deterministic planning, Work Capture, lifecycle actions, or the adaptive daily-plan loop. Keeping it as a cold-launch blocker conflicts with the approved V0.1 direction: the Today Command Center is the core authenticated entry experience.

Do not perform a risky full rewrite.

Instead:

1. Preserve working authentication and infrastructure.
2. Introduce Ryqen domain types.
3. Introduce new database models incrementally.
4. Build the new Today Command Center around the Ryqen model.
5. Move business logic out of the monolithic hook.
6. Reuse useful existing UI/components where appropriate.
7. Deprecate Hunter concepts progressively.
8. Remove obsolete systems only after replacements are stable.

## 13. V0.1 Scope

The core loop is:

```text
Minimal onboarding
 -> goals/context
 -> current work
 -> adaptive daily plan
 -> Today Command Center
 -> meaningful action
 -> progress
 -> better recommendation
```

V0.1 should feel useful without requiring users to configure their entire life.

## 14. Explicitly Deferred

Not V0.1 requirements:

- unrestricted cross-app autonomous control
- broad device automation
- always-listening custom wake-word infrastructure
- default Android assistant integration
- broad all-files device access
- large multi-agent AI swarms
- many AI providers
- real-world credit economy
- physical rewards marketplace
- social systems
- complex gamification economy
- enterprise-scale workflow automation

These can be reconsidered later based on product value, platform constraints, safety, and user control.

## 15. Long-Term Direction

```text
User
  -> Personal Context Model
  -> Goals / Projects / Tasks / Actions
  -> Preferences / History / Connected Data
  -> Ryqen Intelligence Layer
  -> Permission + Validation Layer
  -> Action Layer
  -> Observed Results
  -> Updated Personal Context
```

This is the path toward Ryqen becoming a personal intelligence/action layer.

Increasing capability must not reduce user control.

## 16. Development Workflow

**Founder/Product Owner:** final decisions on product direction, priorities, scope, and trade-offs.

**ChatGPT:** product strategy, architecture, review, specifications, debugging guidance, and protection of approved project direction.

**Codex:** primary implementation agent for repository changes, tests, migrations, refactors, and implementation debugging.

**Android Studio/Gemini:** Android-native work such as Gradle, permissions, Logcat, release builds, and Play Store integration.

**GitHub:** source of truth for project history and architecture documentation.

Codex implements the approved **how**; the founder and ChatGPT determine the **what/why**.

## 17. Decision Rule

When a proposal conflicts with an approved Ryqen decision:

1. Identify the conflict.
2. Explain the trade-off.
3. Explain why changing the decision may or may not be justified.
4. Let the founder decide.
5. Record major approved changes in project documentation.

## 18. Immediate Next Phase

The architecture is approved.

Next, define the **V0.1 data model**:

1. Goal, Project, Task, Action, Context, Daily Plan, and Activity structures.
2. Supabase tables and relationships.
3. Minimum RLS policies and indexes.
4. Planning-engine input/output contract.
5. Today Command Center data contract.
6. Reuse/adaptation/deprecation plan for existing Hunter tables/components.
7. Codex implementation specification.

## 19. Final Principle

Ryqen is not a collection of features.

It is a loop:

**Understand the user → identify meaningful progress → recommend what matters next → help the user act → observe the result → adapt.**

V0.1 exists to prove that loop.
