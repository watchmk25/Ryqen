# Ryqen V0.1 --- Today Command Center Specification

**Status:** Draft for implementation review\
**Scope:** V0.1\
**Product principle:** Ryqen helps the user decide what matters next and
make meaningful progress with minimal friction.

## 1. Purpose

The Today Command Center is the core V0.1 experience. It answers:

1.  What matters today?
2.  Why does it matter?
3.  What should I do next?

Today is an adaptive daily plan, not a generic task list.

## 2. Primary UX

When the user opens Today, Ryqen should provide:

-   A concise greeting/context summary.
-   No more than **3 prominently visible priority actions**.
-   For each priority action: title, estimated time, concise rationale,
    primary action such as Start, and access to Why?
-   Remaining relevant work can appear below the primary priorities.

The screen should remain focused rather than maximizing visible tasks.

## 3. Planning Inputs

The planning engine considers, where available:

-   importance
-   urgency
-   goal impact
-   estimated effort
-   due date
-   dependencies
-   available time
-   capacity
-   preferences
-   current context

It operates over the approved Ryqen model: User, Context, Goal, Project,
Task, Action, Daily Plan, and Activity/Progress.

## 4. Priority Model

Persistent properties remain on their domain records. Contextual
priority is calculated by the planning engine and stored on the **Daily
Plan Item**.

The exact weighting should be deterministic, explainable, and easy to
tune.

Example rationale:

> High importance + due tomorrow + directly supports your active goal.

## 5. Deterministic Logic vs AI

Current V0.1 Today planning is deterministic and operates without an AI provider. AI remains a future, separately approved reasoning/personalization capability; it is not a prerequisite for planning, replanning, or lifecycle actions.

**Deterministic application/domain logic owns:**

-   validation
-   ownership/security checks
-   action eligibility
-   status transitions
-   priority calculation
-   time/capacity constraints
-   dependency constraints
-   plan persistence
-   activity recording
-   replanning triggers

**AI may assist with:**

-   contextual reasoning
-   personalization
-   ambiguous user intent
-   concise rationale
-   sequencing when several valid options exist

AI output must be structured and validated before important state
changes. AI must not directly mutate important database state.

## 6. Today Plan Lifecycle

``` text
draft → active → completed
             ↘ archived
```

Plans may be replanned during the day when circumstances materially
change. The context snapshot records the inputs used to generate the
plan.

### Cross-day work continuity

Daily Plans and Plan Items are date-scoped planning snapshots; persistent
Actions remain the source of truth for work state. A new local day evaluates
pending Actions again without copying or rewriting yesterday's plan.

- Persistent `in_progress` Actions remain visible and controllable in Active
  Work across local-day boundaries. Active Work is separate from the maximum
  three fresh recommendations.
- Paused Actions remain secondary Paused Work across local-day boundaries.
  They remain attached to their historical lifecycle anchor, are never fresh
  recommendations, and return to Active Work only when the user explicitly
  chooses Resume.
- Deferred Actions remain secondary and `deferred` across days. They are only
  made pending again when the user explicitly chooses Reconsider; Ryqen does
  not reactivate them automatically.
- Skip is scoped to a Plan Item in its current plan. It leaves the underlying
  Action pending, so that Action may be evaluated on a later day.

Normal new-day planning preserves previous plans and plan items. An explicit
lifecycle operation may update its original plan item when that item is the
validated audit anchor for the action transition.

Planner reconciliation can create or restore only a valid fresh pending Plan
Item snapshot. It cannot turn a completed, deferred, or cancelled Action, or
an Action made ineligible by a blocked or non-actionable parent, into a
pending recommendation.

## 7. Action Lifecycle

``` text
pending → in_progress → completed
pending → deferred
pending → cancelled
in_progress → deferred
```

Transitions must be validated by application/domain logic.

Meaningful Today lifecycle transitions are executed through protected,
server-validated RPCs. These operations verify the authenticated owner,
validate state, update related Action/Plan Item state atomically, and record
required Activities atomically. Authenticated clients do not directly mutate
Plan Items or Activities.

## 8. User Interactions

### Start

-   Action becomes `in_progress`.
-   An appropriate activity may be recorded.
-   Today remains the primary workspace.
-   Existing Focus Timer may be used where appropriate.

### Complete

-   Action becomes `completed`.
-   Record an `action_completed` activity.
-   Recalculate the relevant Today plan.
-   Surface the next useful priority.

### Defer

Defer is not failure. Move the action out of the immediate plan and
allow the planner to reconsider it later.

### Pause / Resume

Pause temporarily stops an `in_progress` Action with intent to continue. It
changes the Action and its lifecycle Plan Item to `paused`, records an
`action_paused` Activity, and keeps the work visible as Paused Work rather
than a fresh recommendation. Resume explicitly returns matching paused state
to `in_progress`, records `action_resumed`, and starts a new foreground
session. `started_at` is only that open-session marker; previous sessions are
stored in `accumulated_active_seconds`, so Pause/Resume never reset visible
active time. Pause, active Defer, and Complete flush the open session on the
server. Completion records immutable target, final active seconds, and delta
metadata from the lifecycle Plan Item snapshot when a target exists. Pause
does not reactivate or reschedule work automatically; it is intentionally
distinct from Defer.

### Skip

Skipping is distinct from completing. Record it and allow the planner to
reconsider the remaining plan.

## 9. Adaptive Replanning

Replanning can be triggered when:

-   a priority action is completed
-   an action is deferred/skipped
-   available time changes
-   capacity/energy changes
-   an important task becomes urgent
-   a dependency becomes unblocked
-   the user explicitly asks to replan

Avoid unnecessary churn. Preserve user control and avoid surprising
reshuffles.

## 10. Why?

Prominent recommendations should have concise, grounded rationales, such
as:

-   Due tomorrow and directly supports your active goal.
-   High importance and fits your 30-minute window.
-   This unblocks two other actions.

## 11. Empty and Edge States

### No active work

Do not manufacture activity. Explain that nothing urgent needs attention
and offer an appropriate next step.

### No plan yet

Generate a plan when sufficient structured data exists. Otherwise offer
a lightweight way to add useful work/context.

### No available time

Do not create a full plan that cannot fit. Surface a small fitting
action if one exists.

### All priorities complete

Briefly acknowledge progress, then show optional remaining work or
suggest stopping instead of creating busywork.

## 12. V0.1 Boundaries

Do not include initially:

-   calendar synchronization
-   recurring task engine
-   complex dependency graph UI
-   unrestricted cross-app automation
-   always-listening custom wake word
-   autonomous device control
-   multi-agent orchestration
-   vector/embedding memory infrastructure
-   multiple AI providers
-   credits/economy
-   social features
-   complex gamification

## 13. Existing App Migration

Evolve the existing Hunter-oriented app incrementally; do not rewrite
it.

The new Today experience should gradually replace the quest-driven Home
logic. Legacy functionality may remain temporarily where useful.

Do not turn `useHunterData` into the permanent planning brain. Move
planning toward dedicated application/domain services.

## 14. Architectural Boundary

Target:

``` text
Today UI
   ↓
Application action/service
   ↓
Domain validation + planning logic
   ↓
Supabase data layer
   ↓
Activity / plan state
```

AI-assisted path:

``` text
Structured context
   ↓
Planning candidates
   ↓
AI reasoning
   ↓
Structured validated proposal
   ↓
Deterministic validation
   ↓
Application state
```

## 15. V0.1 Success Criterion

The core proof is:

> **Can Ryqen reliably turn the user's actual circumstances into a
> small, understandable, useful plan for today?**

Success means reduced decision friction and meaningful progress without
requiring the user to manage a complicated system.

## 16. Implementation Handoff

Codex implementation must follow this specification plus:

-   `RYQEN_V0.1_ARCHITECTURE.md`
-   `RYQEN_V0.1_DATA_MODEL.md`

Before implementation, Codex should:

1.  Inspect the existing Today/Home flow and relevant hooks/services.
2.  Identify the minimum required code changes.
3.  Preserve working functionality where possible.
4.  Separate deterministic planning/application logic from UI.
5.  Validate database mutations.
6.  Add focused tests for priority calculation and status transitions
    where practical.
7.  Avoid new migrations unless a concrete schema gap is found and
    separately approved.

Codex should not invent new product architecture during implementation.

## 17. Approved Product Decision

**Today prominently displays a maximum of 3 priority actions.**

This is intentional: Ryqen prioritizes meaningful progress rather than
presenting an overwhelming activity list.
