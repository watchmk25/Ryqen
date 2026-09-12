# RYQEN — PROJECT CONTEXT

**Version:** 0.1 working context
**Purpose:** Portable source of truth for the Ryqen project
**Last updated:** 2026-09-12

> This file is the durable project context. Chat history and AI memory are helpful, but this document should be kept with the codebase and updated when major decisions change.

---

## 1. Project vision

Ryqen is intended to become a personalized system that helps people make their life and work easier, better, and more manageable by understanding the individual, helping them decide what matters, turning intentions into actions, and adapting as it learns.

Long term, Ryqen may evolve into a personal intelligence/action layer for each user — a practical "personal Jarvis" direction — able to work with user-authorized files, supported apps/services, specialized AI tools, and eventually deeper voice/system capabilities while preserving user control, safety, and platform compliance.

V0.1 is deliberately small. It is the first useful piece of that larger system, not the final product.

---

## 2. V0.1 target user

A person who has goals and potential but struggles to consistently organize their life and decide what to work on next.

### V0.1 promise

**Ryqen helps you figure out what matters today and turn it into actions you can actually take.**

---

## 3. Core product loop

Understand → Plan → Act → Observe → Adapt

For V0.1:

User → profile/goals → current state → recommendation → action → result → progress → better recommendation

---

## 4. Approved product decisions

### Decision 1 — Target user
V0.1 targets people with goals and potential who struggle to organize their life/work and decide what to do next.

### Decision 2 — Progressive onboarding
Ryqen should learn what is necessary instead of making users fill out a long form. Learn progressively over time.

### Decision 3 — Give value immediately
Ryqen must provide useful value during the first session before asking for extensive information.

Supporting rule: never ask for information unless Ryqen has a useful reason to need it.

### Decision 4 — Today Command Center
The primary V0.1 experience is a personalized Today command center that prioritizes what matters, what to do next, why it matters, and progress.

The dashboard can become dynamic later based on user needs, goals, behavior, time, and context.

### Decision 5 — Goal/context-driven system
Ryqen should be goal- and context-driven rather than feature-driven. Users do not have to use all tools. Specialized tools remain capabilities behind the system rather than disconnected mini-products.

### Decision 6 — Progressive memory
Ryqen should progressively learn useful, user-controlled context so recommendations become more personal without exhaustive onboarding or purposeless data collection.

### Decision 7 — Optimize meaningful progress
Ryqen optimizes for meaningful progress and reduced friction, not maximum activity. Progress, maintenance, and recovery are all legitimate outcomes.

### Decision 8 — Proactive but restrained
Ryqen should proactively surface useful opportunities, risks, and next steps without becoming intrusive. Users should control its level of proactivity.

Recommendations, prepared actions, and executed actions are distinct. Sensitive or irreversible actions require appropriate authorization.

### Decision 9 — Unified intelligence + specialized tools
Users should experience one Ryqen intelligence. Ryqen should select internal capabilities, specialized AI providers, or external tools based on suitability, reliability, privacy, permissions, speed, and cost. AI is not used when a deterministic or simpler solution is better.

Architect for multiple providers, but V0.1 should start with one primary reasoning provider and add specialists only when there is a real advantage.

### Decision 10 — Adaptive personality
Ryqen may adapt communication style, pacing, difficulty, and interaction style to the user. Core standards do not change: honesty, safety, privacy, respect, and autonomy.

### Decision 11 — User remains in control
As Ryqen becomes more capable, user control must not decrease. Users should be able to inspect, override, reject, undo when possible, manage permissions, and control memory. Stronger actions require stronger authorization.

### Decision 12 — Personal-Jarvis direction
Long-term Ryqen should evolve toward a personal intelligence and action layer for each user: understanding context, helping think and decide, using tools and specialized AI, and eventually performing authorized actions across the user's digital environment.

### Decision 13 — Unified evolving user context
Ryqen should build a structured evolving model of relevant life/work context and distinguish persistent facts, preferences, goals, temporary circumstances, observations, and uncertainty. Retain only information that creates meaningful utility.

### Decision 14 — Adaptive daily plan
The central V0.1 capability is an adaptive daily plan that prioritizes meaningful actions within the user's actual time and circumstances, explains why actions matter, and adjusts when circumstances change.

### Decision 15 — Goal → Project → Task → Action
Ryqen distinguishes Goals, Projects, Tasks, and Actions.

- Goal = desired outcome
- Project = meaningful body of work toward a goal
- Task = work component
- Action = concrete next step

Standalone Actions are allowed. Users should not have to manually construct the entire hierarchy; Ryqen can help derive it.

### Decision 16 — Dynamic prioritization
Ryqen should prioritize actions using importance, urgency, goal impact, effort, available time, current capacity, dependencies, and user preferences. Recommendations should be explainable in ordinary language. Ryqen may recommend doing less when that is genuinely the best choice.

### Decision 17 — AI as reasoning/personalization layer
In V0.1, AI primarily serves as the reasoning and personalization layer behind planning. AI outputs must be structured, validated, and bounded by deterministic rules.

AI must not rewrite reality: AI claims are not proof that an action happened.

### Decision 18 — Trust, validation, and authorization
Meaningful actions must pass appropriate authentication, authorization, and validation before execution.

AI-generated instructions are proposals, not proof. Important actions should produce verifiable results and auditable records. Stronger consequences require stronger authorization.

### Decision 19 — Capability safety
Every Ryqen tool or AI capability operates inside an explicit permission and safety boundary. Ryqen should evaluate capabilities before use, restrict access to minimum necessary scope, validate inputs/outputs, and block or escalate actions outside safety or authorization limits.

More capable tools require stronger controls.

### Decision 20 — Business success follows user value
Ryqen should optimize for genuine usefulness, meaningful progress, trust, and healthy retention rather than maximizing screen time, notifications, or compulsive engagement. Revenue should follow sustained usefulness rather than undermine it.

---

## 5. Important long-term principles

### Capability-rich, experience-simple
Behind the scenes Ryqen may become extremely sophisticated. The user's experience should remain simple.

### Work with the user's digital environment
Long term, Ryqen should be able to work with user-authorized files, supported apps/services, specialized AI/tools, and potentially system-level voice interaction.

Use official integrations, intents, APIs, share mechanisms, file pickers, and other supported interfaces whenever available. Do not design the platform around unrestricted autonomous control of every Android app.

### AI is not authority
AI may reason, recommend, plan, interpret, and select tools. Deterministic systems and backend authorization decide whether actions are valid and allowed.

### More power requires more control
The more consequential a capability is, the stronger its permission, validation, confirmation, audit, and safety requirements should be.

---

## 6. V0.1 scope

### Build now
- Reliable authentication
- Progressive onboarding
- User profile and goals
- Capabilities/abilities
- Current stats as a supporting gamification layer
- Activities/history
- Reliable quests/actions
- Reliable XP and progression
- Daily adaptive plan
- Basic feedback
- Basic personalization
- Existing useful utility features such as focus and hydration, once stabilized

### Design now, build later
- Multi-AI orchestration
- Specialist AI provider adapters
- Persistent structured memory
- Richer goals/projects/tasks/actions
- File workflows
- External app/service integrations
- Voice-first interaction
- Deeper system assistant integration
- Advanced automation
- Credits and real-world rewards
- Marketplace/partnerships

### Do not build yet
- AI agent swarm
- Unrestricted accessibility-based app automation
- Broad all-files access by default
- Complex reward economy
- Social network
- Dozens of AI providers
- Massive feature collection
- Large-scale physical goods marketplace
- Elaborate monetization before product value is demonstrated

---

## 7. Current technical reality

Ryqen currently uses Expo SDK 54 / React Native 0.81 / React 19, with Supabase for backend/auth/data, an existing Android project, quests, XP, stats, streaks, hydration, focus, notifications, and profile/onboarding systems.

The engineering audit found:

- TypeScript compilation passes.
- Existing app structure is small enough to stabilize without a rewrite.
- Current XP logic is unsafe: quest toggling can overwrite lifetime XP with only today's completed-quest XP.
- Focus XP has a stale-state/race problem.
- There is no XP event ledger or server-authoritative award operation yet.
- Database schema/migrations were previously absent from the repository; the current remote baseline has now been pulled into `supabase/migrations/20260912114530_remote_schema.sql`.
- The current backend uses RLS ownership policies, but progression integrity still needs server-side controls.
- Existing rank definitions conflict and rank does not currently progress correctly.
- Automated tests and CI are not yet established.

Do not redesign the entire app. Evolve it carefully.

---

## 8. Current workshop/tool roles

### Human founder — user
Final product/business authority. Decides the direction and approves major product/system decisions.

### ChatGPT — core guide
Primary product/strategy/architecture partner and critical reviewer. Maintains the big picture, challenges assumptions, translates decisions into engineering specifications, and helps with technical problems.

### Codex in VS Code — primary engineer
Implements concrete repository changes, runs commands/tests, refactors, creates migrations, and debugs according to approved specifications.

### Android Studio + Gemini — Android specialist
Used for Android-specific issues: native configuration, Gradle, Logcat, permissions, release builds, Play Store issues, and native integrations.

### Perplexity — research specialist
Used when fresh web research is needed: current APIs, competitors, policies, tools, pricing, market information, etc.

Other AIs/tools are specialists brought in only when they provide a real advantage.

---

## 9. Development workflow

1. Founder brings goal/problem to ChatGPT.
2. ChatGPT proposes/recommends a product or architectural decision.
3. Founder approves/changes it.
4. ChatGPT turns the decision into a concrete engineering specification.
5. Codex implements.
6. Founder tests the real app/emulator.
7. Results/errors come back to ChatGPT.
8. ChatGPT reviews and determines the next step.

Never let a coding AI silently become the product decision-maker.

---

## 10. Immediate next milestone

The Constitution is directionally approved and Decisions 1–20 are approved.

Next we should finish the V0.1 Product Specification, especially:

- exact Goal/Project/Task/Action model
- exact priority model
- exact daily-plan behavior
- exact V0.1 AI experience
- progression/XP/rank rules
- feedback and learning behavior
- V0.1 success criteria

Only after those are clear should Codex implement the foundation changes.

---

## 11. Context preservation rule

This file should be committed to the Ryqen repository and treated as a canonical project context document.

When a major product decision is approved or changed, update this file (or its more granular successor documents) so the project does not depend on any single conversation or model's memory.

Recommended future durable documents:

- `docs/RYQEN_CONSTITUTION.md`
- `docs/RYQEN_PRODUCT_SPEC_V0.1.md`
- `docs/RYQEN_DECISIONS.md`
- `docs/RYQEN_ARCHITECTURE.md`
- `docs/RYQEN_CURRENT_STATE.md`

ChatGPT Project context and files should complement these documents, not replace them.
