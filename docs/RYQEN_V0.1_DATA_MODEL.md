# Ryqen V0.1 Data Model

**Status:** Approved  
**Version:** V0.1  
**Relationship:** Implements the approved `RYQEN_V0.1_ARCHITECTURE.md`

## 1. Purpose

This document defines the lean V0.1 domain model that supports Ryqen's core loop:

**Understand → Plan → Act → Observe → Adapt**

The model is designed around the user's reality rather than around a collection of rigid product features.

The database stores durable user data and planning snapshots. It is not the intelligence layer.

---

## 2. Core Concepts

V0.1 contains eight core concepts:

1. User
2. Context
3. Goal
4. Project
5. Task
6. Action
7. Daily Plan
8. Activity / Progress

### Relationship overview

```text
auth.users
│
├── contexts
│
├── goals
│   └── projects
│       └── tasks
│           └── actions
│
├── daily_plans
│   └── plan_items
│
└── activities
```

The relationships are intentionally flexible. Goals, Projects, Tasks, and Actions are distinct concepts, and standalone Actions are allowed.

---

## 3. User

Authentication is provided by Supabase Auth:

```text
auth.users
```

V0.1 does not duplicate authentication data in a second users table.

A separate lightweight profile/preferences model may be introduced later if concrete product requirements justify it.

---

## 4. Context

Context represents relevant current circumstances that can influence planning.

Examples:

- available time
- energy
- current constraints
- work mode
- temporary preferences
- commitments

V0.1 uses a flexible context-entry model rather than a large set of rigid columns.

Conceptual structure:

```text
contexts
├── id
├── user_id
├── key
├── value
├── source
├── expires_at
├── created_at
└── updated_at
```

`value` is intended to be JSON/JSONB so different context values can have different shapes.

Examples:

```text
available_time → 45
energy → "low"
work_mode → "focused"
constraint → {"type":"meeting","start":"16:00"}
```

Context is user-relevant data, not unrestricted AI memory. Any future AI-proposed context changes must pass through validation.

---

## 5. Goals

A Goal represents a meaningful desired outcome.

Example:

```text
Launch Ryqen V0.1
```

Conceptual structure:

```text
goals
├── id
├── user_id
├── title
├── description
├── status
├── importance
├── target_date
├── created_at
└── updated_at
```

Recommended status values:

```text
active
completed
paused
archived
```

`importance` is a persistent user/domain attribute, not a dynamic plan score.

---

## 6. Projects

A Project represents a body of related work that may contribute to a Goal.

Conceptual structure:

```text
projects
├── id
├── user_id
├── goal_id        nullable
├── title
├── description
├── status
├── importance
├── target_date
├── created_at
└── updated_at
```

`goal_id` is nullable so independent Projects are supported.

---

## 7. Tasks

A Task represents meaningful work.

Conceptual structure:

```text
tasks
├── id
├── user_id
├── project_id     nullable
├── goal_id        nullable
├── title
├── description
├── status
├── importance
├── urgency
├── estimated_minutes
├── due_at
├── created_at
└── updated_at
```

Tasks may be associated with a Project, directly with a Goal, or exist independently.

Persistent prioritization inputs include:

- importance
- urgency
- effort
- due date

Dynamic planning considers these together with context and capacity.

---

## 8. Actions

An Action is a concrete next step that can actually be performed.

Example:

```text
Task: Prepare investor presentation

Actions:
- Open presentation draft
- Write market slide
- Review financial assumptions
- Send draft to cofounder
```

Conceptual structure:

```text
actions
├── id
├── user_id
├── task_id       nullable
├── project_id    nullable
├── goal_id       nullable
├── title
├── description
├── status
├── estimated_minutes
├── due_at
├── created_at
└── updated_at
```

Recommended status values:

```text
pending
in_progress
completed
cancelled
```

An Action can belong to a Task, Project, Goal, or none of them.

Standalone Actions are explicitly supported.

The implemented Action timing fields are `started_at` and
`accumulated_active_seconds`. `started_at` marks only the current open active
session; `accumulated_active_seconds` durably stores prior closed sessions.
Protected lifecycle RPCs flush the open session on Pause, active Defer, and
Complete. Resume starts a new session without discarding accumulated time.
When a target exists, the completion Activity stores immutable
`target_minutes`, `active_seconds`, and `delta_seconds` from the lifecycle
Plan Item snapshot.

### Action temporal precision

Actions retain legacy `due_at` temporarily for compatibility with records and
clients created before temporal precision. New V0.1 standalone Action capture
uses authoritative local-calendar fields instead:

- `due_date date NULL` is the optional calendar deadline.
- `due_time time NULL` is optional exact local-clock precision and is valid
  only when `due_date` exists.

A date without a time means "due on this date," not an invented end-of-day
deadline. New capture therefore does not populate `due_at`; readers prefer
`due_date`/`due_time` and use legacy `due_at` only when the new date is absent.
Planner scoring remains date-level in V0.1. Action-specific reminders remain a
separate future notification-intent capability and are intentionally not part
of this model change.

---

## 9. Daily Plans

A Daily Plan is a planning snapshot for a particular day.

It is not a permanent duplicate of the user's tasks.

Conceptual structure:

```text
daily_plans
├── id
├── user_id
├── plan_date
├── status
├── context_snapshot
├── generated_at
├── created_at
└── updated_at
```

`plan_date` is a calendar date.

`context_snapshot` preserves the relevant planning context used when the plan was generated.

This supports historical explainability.

For example, if a plan was generated when the user had two hours available and high energy, the system can retain that basis even if circumstances later change.

V0.1 should enforce:

```text
unique(user_id, plan_date)
```

so there is one official Daily Plan per user/day.

---

## 10. Plan Items

Plan Items represent recommended Actions inside a Daily Plan.

Conceptual structure:

```text
plan_items
├── id
├── daily_plan_id
├── action_id
├── position
├── priority_score
├── rationale
├── estimated_minutes
├── status
└── created_at
```

A Plan Item stores the planning result, including:

- position
- calculated priority
- rationale
- estimated effort
- current plan-item status

Recommended status values can initially mirror the plan lifecycle needed by the UI, without creating a complex workflow.

---

## 11. Activity / Progress

Activities provide historical records of meaningful events.

Conceptual structure:

```text
activities
├── id
├── user_id
├── action_id       nullable
├── task_id         nullable
├── type
├── metadata
├── occurred_at
└── created_at
```

Examples:

```text
action_completed
task_completed
plan_item_started
plan_item_skipped
goal_progress
```

`metadata` is JSON/JSONB for event-specific information.

Activities answer:

> What actually happened?

This is different from Tasks and Actions, which answer:

> What needs to happen?

---

## 12. Priority Model

This is a foundational Ryqen decision.

Persistent records store attributes such as:

```text
importance
urgency
estimated effort
due date
```

The planning engine additionally considers:

```text
current context
available time
capacity
dependencies
preferences
goal impact
```

The planning engine produces a contextual result:

```text
priority_score
```

That score belongs to the **Plan Item**, not permanently to the Action.

### Why

An Action can have different priority at different times.

```text
Monday
→ priority 90

Tuesday
→ priority 40
```

because circumstances changed.

Therefore:

```text
Persistent attributes
        +
Current context
        ↓
Planning engine
        ↓
Contextual priority
        ↓
Plan Item
```

The database must not treat an AI-generated score as permanent truth.

---

## 13. AI Boundary

The database model deliberately separates AI reasoning from application state.

The preferred flow is:

```text
Relevant data
    ↓
Planning preparation
    ↓
AI proposal
    ↓
Schema validation
    ↓
Business-rule validation
    ↓
Permission checks
    ↓
Persist approved result
```

AI does not directly write important state.

Deterministic application logic remains responsible for state integrity.

---

## 14. Ownership and RLS

Every user-owned table must contain:

```text
user_id
```

and be protected with Supabase Row Level Security.

The basic ownership rule is:

```text
record.user_id = auth.uid()
```

Relationship integrity must also be considered. A user must not be able to create a record owned by themselves while referencing another user's Goal, Project, Task, or Action.

The exact SQL policies will be specified in the migration.

---

## 15. Index Strategy

V0.1 should use a small number of useful indexes.

Initial candidates:

```text
contexts(user_id)

goals(user_id, status)

projects(user_id, status)

tasks(user_id, status)

actions(user_id, status)

actions(user_id, due_at)

daily_plans(user_id, plan_date)

plan_items(daily_plan_id, position)

activities(user_id, occurred_at)
```

A unique constraint should enforce:

```text
daily_plans(user_id, plan_date)
```

Additional indexes should be added only when actual query patterns justify them.

---

## 16. Constraint Strategy

V0.1 should prefer straightforward text fields with database `CHECK` constraints for evolving statuses rather than PostgreSQL enum types.

This keeps early migrations easier to evolve while still enforcing valid values.

Numeric fields such as importance should also receive database-level bounds where appropriate.

The database should enforce invariants that matter to data integrity; UI validation is not sufficient.

---

## 17. What Is Deliberately Not Included

The V0.1 model does not include:

- recurring task engines
- calendar synchronization
- complex dependency graphs
- vector databases
- embeddings
- AI memory infrastructure
- multi-agent orchestration
- multi-provider AI infrastructure
- real-world credits
- physical rewards
- social graphs
- unrestricted app automation
- broad device file access
- complex scheduling optimization

These remain future possibilities.

---

## 18. Migration From the Existing Schema

The current Supabase schema contains legacy Hunter-era structures such as:

- characters
- quests
- hunter abilities
- hunter profile
- focus sessions
- saved timers
- water logs

Those tables are not the target Ryqen domain model.

V0.1 migration should be incremental.

### Strategy

1. Keep working authentication and useful infrastructure.
2. Add the new Ryqen domain structures.
3. Build the new Today Command Center against the new model.
4. Gradually move business logic out of the existing Hunter-oriented hook.
5. Reuse useful existing features where they still provide value.
6. Deprecate Hunter-specific structures progressively.
7. Remove obsolete structures only after replacements are stable.

No full rewrite is required.

---

## 19. Progression / XP Boundary

Gamification is not the foundation of the Ryqen data model.

If XP/progression remains in V0.1, lifetime progression should not be reconstructed from today's quest rows.

A future progression model should prefer an event/ledger approach such as:

```text
xp_events
├── user_id
├── source
├── amount
├── idempotency_key
├── occurred_at
└── metadata
```

This is intentionally a future design direction, not part of the current core schema.

Real-world credits/economic balances must be completely separate from XP/progression.

---

## 20. V0.1 Core Data Flow

The complete model supports:

```text
User
  ↓
Context
  ↓
Goals
  ↓
Projects
  ↓
Tasks
  ↓
Actions
  ↓
Planning Engine
  ↓
Daily Plan
  ↓
Plan Items
  ↓
User action
  ↓
Activity / Progress
  ↓
Updated context
  ↓
Next planning cycle
```

Not every user must use every level.

For example, Ryqen can support:

```text
Goal → Action
```

or simply:

```text
Action
```

without forcing unnecessary hierarchy.

---

## 21. Approval Boundary

This document defines the approved **V0.1 data-model direction**.

The next artifact is the **proposed SQL migration**.

The SQL must be reviewed separately before execution against Supabase.

No database changes should be assumed from this document alone.

---

## 22. Final Principle

The data model exists to represent meaningful reality:

**What does the user care about?  
What work exists?  
What can actually be done?  
What is happening right now?  
What happened?**

The planning engine then uses that reality to determine:

**What matters next?**
