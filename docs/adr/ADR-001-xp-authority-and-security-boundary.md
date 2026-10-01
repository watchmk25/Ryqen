

# ADR-001: XP Authority and Security Boundary

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Founder / Ryqen Project Lead
- **Supersedes:** None
- **Related:** ADR-000 — AI Workshop Operating Model

## Context

Ryqen V0.1 currently contains XP/progression behavior inherited from the
earlier Hunter-oriented product structure.

The current V0.1 architecture specification describes the existing Hunter
terminology, quests, XP, character/rank concepts, stat personalization,
onboarding/assessment, and central hook as legacy product structure. It also
explicitly defers a complex gamification economy from V0.1.

The founder has subsequently made an explicit product decision that
**XP/progression remains an intentional V0.1 capability**.

This ADR therefore records a deliberate change in the treatment of XP.

XP remains in V0.1, while the broader legacy Hunter/gamification system is
not thereby reinstated as a V0.1 requirement.

This decision does not expand V0.1 to include a broader gamification economy,
quest system, or generalized progression architecture. Those remain outside
this decision unless separately approved.

The current XP implementation is client-authoritative.

`src/screens/ToolsTab.tsx` increments local XP when a focus session completes:

```ts
setXp(xp + xpEarned)

src/hooks/useHunterData.ts then persists the resulting value directly to
 characters:



supabase
  .from('characters')
  .update({ total_xp: xp, level: calcLevel(xp) })
  .eq('user_id', userId)

The current characters database boundary grants authenticated clients broad
 UPDATE access protected by ownership RLS. There are currently no column-level
 privileges restricting direct mutation of progression fields.



The repository evidence audit established that:



 XP and level are displayed by the current UI. 

 Rank is displayed but is not currently advanced by runtime code. 

 Today Command Center and its planning/lifecycle systems do not depend on
 XP or progression state. 

 Onboarding does not require client writes to total_xp or level. 

characters contains multiple unrelated concerns, including identity,
 ability statistics, streak state, and progression state. 

 Existing tests do not currently cover XP authority or characters
 authorization. 

 The repository cannot establish the state of XP values in the live
 production database. 

 Focus-session duration is currently supplied by the client and therefore
 requires an explicit trust/validation decision as part of authoritative XP
 awarding. 

Specification Change

The current V0.1 architecture specification treats XP and related Hunter
 progression concepts as legacy product structure and does not define XP as
 an intentional V0.1 requirement.



The founder has explicitly decided that XP/progression remains an intended
 V0.1 capability.



This ADR therefore changes the product treatment of XP while preserving the
 existing scope boundary around broader gamification.



Specifically:



 XP/progression remains a V0.1 capability. 

 The broader legacy Hunter product structure is not automatically restored. 

 A complex gamification economy remains outside V0.1. 

 Quest-system expansion remains outside this decision. 

 Generalized event sourcing or a full progression economy remains outside
 this decision. 

 Any future expansion of these areas requires a separate decision. 



This explicit decision takes precedence over the previous specification's
 treatment of XP as legacy product structure, in accordance with the
 source-of-truth hierarchy established by ADR-000.

Decision

XP/progression is an intentional Ryqen V0.1 product capability.



XP must therefore become a server-authoritative and validated capability.



The existing client-authoritative XP mutation path must not remain the
 authority for lifetime XP.



The implementation will establish a minimum trustworthy XP authority boundary
 without introducing a full V0.2 gamification or event-sourcing architecture.



Specifically:



 Client UI may request or initiate an eligible XP-producing action, but must
 not directly determine or persist lifetime XP totals. 

 Server-side logic must validate the conditions for an XP award before
 modifying authoritative progression state. 

 Lifetime XP and derived level must be protected from direct client
 mutation. 

 The characters authorization boundary must be narrowed so legitimate
 profile and onboarding fields remain writable while progression fields are
 protected. 

 Existing XP data must not be silently assumed to be trustworthy or
 automatically rewritten as part of this change. 

 The treatment of existing historical XP values must be explicitly
 determined during implementation or migration rather than implicitly
 reset. 

 XP awarding must have an explicit validation and idempotency strategy so
 the same qualifying event cannot unintentionally award XP multiple times. 

 The trust model for focus-session duration must be explicitly addressed
 before duration-derived XP becomes authoritative. 

 Today Command Center remains independent of XP authority. This decision
 does not introduce XP dependencies into Today planning or lifecycle logic. 

 A full XP ledger, event-sourcing system, or broader gamification economy is
 outside V0.1 unless a later decision explicitly introduces it. 

Security Boundary

The target authority boundary is:



Client
  |
  | request eligible activity
  v
Validated server-side operation
  |
  | determine / verify award
  v
Authoritative progression mutation
  |
  v
characters progression state

The client must not be able to replace this with:



Client-calculated XP
        |
        v
characters.total_xp

The existing broad authenticated UPDATE permission on characters must
 therefore be replaced or constrained sufficiently to prevent direct mutation
 of authoritative progression fields while preserving legitimate application
 writes.



The following existing legitimate client-owned concerns must be considered
 when narrowing this boundary:



name 

onboarding_complete 

str 

int 

vit 

agi 

endurance 



Legacy streak and quest-related mutation paths must also be evaluated before
 changing their authorization boundary.



This ADR does not assume that every existing characters field should become
 server-only. The security boundary applies specifically to authoritative
 progression state and must preserve unrelated legitimate application
 behavior.

Existing Data

The repository cannot establish whether existing production XP values are
 accurate, manipulated, or otherwise trustworthy.



Therefore:



 Existing XP values must not be silently rewritten. 

 Existing XP values must not automatically be treated as verified merely
 because they exist in the database. 

 Existing XP values must not be silently reset as part of the authority
 change. 

 The implementation must explicitly document whatever treatment is chosen
 for historical values. 



The treatment of historical XP is an implementation decision constrained by
 this ADR and must be verified before deployment.

Focus Session Trust

Current focus-session XP is derived from client-reported session duration.



Because lifetime XP becomes authoritative, the implementation must explicitly
 define what evidence the server accepts as sufficient for an XP-producing
 focus session.



The server must not blindly trust an arbitrary client-provided XP amount.



The implementation must determine the smallest V0.1-appropriate validation
 mechanism that prevents a client from simply selecting an arbitrary lifetime
 XP increase.



A stronger focus-session verification model may be introduced later if
 required, but this ADR does not require a generalized activity-verification
 framework.

Characters Authorization Scope

characters contains multiple concerns beyond progression.



The implementation must therefore avoid a blanket removal of all legitimate
 client writes.



Before changing the authorization boundary, the implementation must account
 for the existing writes associated with:



 onboarding identity fields 

 ability assessment fields 

 profile fields 

 legacy streak/quest state where still required by current runtime behavior 



At minimum, protection must prevent ordinary authenticated clients from
 directly modifying authoritative:



total_xp 

level 



The final authorization mechanism is an implementation detail and is not
 prescribed by this ADR.

Scope

In scope

 Authoritative XP award mechanism. 

 Protection of total_xp. 

 Protection of derived level. 

 Validation of XP-producing activity. 

 Idempotency / duplicate-award protection. 

characters authorization boundary for progression fields. 

 Removal of direct client XP persistence. 

 Tests covering progression authorization and award behavior. 

 Explicit treatment of existing XP data. 

 Explicit trust model for focus-session-derived XP. 

Out of scope

 Rebuilding the entire gamification system. 

 Restoring the broader legacy Hunter product structure. 

 New V0.2 progression mechanics. 

 A complex gamification economy. 

 A generalized event-sourcing architecture. 

 A generalized XP/activity ledger beyond what is minimally required for
 V0.1 authority and idempotency. 

 Reworking Today planning around XP. 

 Introducing multi-provider AI orchestration. 

 Automatic redesign of rank progression unless required by the
 authoritative XP implementation. 

 Expanding the quest system. 

Rejected Alternatives

1. Remove XP from V0.1

This was considered because the existing XP implementation is legacy and
 currently unsafe.



It was not chosen because the founder explicitly decided that XP/progression
 remains an intended V0.1 capability.

2. Preserve client-authoritative XP and only change the UI

This was rejected because changing presentation without changing authority
 would leave the underlying integrity and authorization problem intact.

3. Freeze or permanently disable progression

This would prevent further client corruption but would not provide a usable
 authoritative XP capability for V0.1.



The chosen direction instead retains XP while rebuilding its authority boundary.

4. Introduce a full XP ledger / event-sourcing architecture immediately

This was considered as a stronger long-term authority model.



It was not chosen for V0.1 because it introduces substantially more
 architecture than is currently required.



A later decision may introduce a richer progression ledger or event-sourcing
 model if product requirements justify it.

Consequences

Positive

 XP becomes a trustworthy V0.1 capability rather than client-controlled
 mutable state. 

 Lifetime progression cannot be directly rewritten by an authenticated
 client through the existing table boundary. 

 The XP implementation gains an explicit security and integrity boundary. 

 Today remains architecturally independent from progression. 

 The implementation can remain small enough for V0.1. 

 The previous specification conflict is explicitly documented rather than
 silently overridden. 

Costs / risks

 The existing direct client XP update path must be replaced. 

 Database authorization becomes more granular. 

 Existing XP values require explicit treatment. 

 Focus-session validation must be addressed before session-derived XP can be
 considered authoritative. 

 Additional integration tests are required. 

 Legacy characters concerns make the authorization change more delicate
 than simply revoking all UPDATE access. 

 The broader legacy Hunter/gamification structure remains partially present
 while XP is selectively retained as a V0.1 capability. 

Implementation Constraints

Implementation must:



 Preserve onboarding and legitimate profile updates. 

 Remove the client as the authority for lifetime XP. 

 Prevent direct authenticated mutation of authoritative XP fields. 

 Validate award eligibility server-side. 

 Prevent duplicate awards. 

 Preserve existing Today behavior. 

 Avoid introducing unnecessary V0.2 architecture. 

 Include automated authorization and integrity tests. 

 Avoid silently rewriting historical XP. 

 Document the migration or treatment of existing XP values. 

 Explicitly define how focus-session duration is trusted or validated. 

 Preserve legitimate non-progression characters writes. 

 Avoid expanding the scope into the broader legacy Hunter/gamification
 system. 

Validation Requirements

Before this decision is considered implemented:



 A normal authenticated client cannot directly update
 characters.total_xp. 

 A normal authenticated client cannot directly update characters.level. 

 Legitimate onboarding/profile operations continue to work. 

 A qualifying XP-producing action awards the expected XP. 

 An invalid or unqualified action cannot award XP. 

 Replaying the same qualifying operation does not duplicate the award. 

 The client cannot choose an arbitrary lifetime XP amount. 

 Existing Today planning/lifecycle behavior remains unchanged. 

 XP/progression authorization tests pass. 

 Relevant existing test suites pass. 

 The treatment of existing XP data is explicitly verified. 

 Focus-session XP cannot be increased merely by submitting an arbitrary
 client-selected XP amount. 

Evidence

The decision is based on the Tier-3 workshop process defined by ADR-000:



 Independent proposal from Claude Opus. 

 Independent proposal from Gemini. 

 Unanchored adversarial review. 

 Repository evidence audit using the current implementation. 

 Targeted repository-grounded review of this ADR. 



The repository audit confirmed the current client-authoritative XP path,
 broad characters UPDATE privileges, onboarding dependencies, lack of
 progression security tests, and absence of XP dependencies in Today.



The repository also establishes that the current V0.1 architecture
 specification treats XP and related Hunter progression concepts as legacy
 product structure.



The founder's explicit product decision to retain XP in V0.1 is therefore
 recorded in this ADR as a deliberate change to that previous treatment.



Production database state was not established by repository evidence and must
 not be inferred from this ADR.

Decision Rationale

The founder has explicitly decided that XP/progression remains an intended
 V0.1 capability.



The decision does not preserve the current implementation merely because the
 feature is retained. The current client-authoritative mutation path is
 incompatible with the required integrity and security boundary.



The chosen direction is therefore to:



retain XP as a deliberately scoped V0.1 capability while rebuilding its
 authority boundary around the smallest trustworthy server-side mechanism
 necessary for V0.1.



This does not restore the broader legacy Hunter/gamification product
 structure.



Future expansion of progression, gamification, event history, XP economics,
 quest systems, or broader activity verification requires a separate decision
 rather than being implicitly included in this ADR.