# Ryqen engineering audit

**Audit date:** 2026-09-12  
**Scope:** Read-only review of the tracked source, present generated Android project, local configuration, package manifest/lockfile, and TypeScript compilation. No application behaviour was changed. `npx tsc --noEmit` passes. `expo-doctor` could not be run because the package was unavailable in the offline npm cache.

## Executive summary

Ryqen is a small Expo SDK 54 / React Native application using a thin Supabase client directly from the UI. It has a coherent early-product structure and a clear Hunter-themed experience, but its progression data is not safe yet: a quest toggle replaces lifetime XP with the XP from today’s completed quests. Focus XP has a separate, stale-state update path. Both values are persisted directly from the client without an event ledger or server-side integrity boundary.

The repository also does not contain the Supabase migrations, schema, seed, database types, Row Level Security (RLS) policies, storage policies, or any tests. Therefore the actual backend data model and access controls cannot be reproduced or fully audited from this checkout. This is the principal Phase 1 foundation gap after XP correctness.

## A. Current architecture

| Area | Current implementation | Why it matters | Severity |
| --- | --- | --- | --- |
| Application entry | `index.ts` registers `App.tsx` through Expo. `App.tsx` configures the notification handler and switches between `LoginScreen` and `MainApp` based on a Supabase session held in Zustand. | Simple entry point with no routing framework. | Low |
| Screen composition | `src/screens/MainApp.tsx` holds the selected tab and mounts one of four conditional screens: Home, Stats, Tools, Profile. There is no React Navigation stack, URL/deep-link routing, screen restoration, or screen-level error boundary. | Fine for a prototype, but navigation state and flows will become difficult to extend and test. | Medium |
| Domain state | `src/hooks/useHunterData.ts` is the de facto domain layer for character, quests, XP, onboarding, ability-assessment state, and streaks. `src/store/authStore.ts` holds only the auth session. Most other data is component-local. | The intended central hook exists, but XP is also mutated from screens/components, breaking the convention recorded in `.github/copilot-instructions.md`. | High |
| Data access | `src/lib/supabase.ts` creates a browser/mobile Supabase client with `AsyncStorage` session persistence. UI and hook code issue direct table and Storage operations. | There is no repository/service layer, RPC, transaction, retry, error mapping, query cache, or typed generated database client. | High |
| UI system | Design tokens are in `src/constants/theme.ts`; shared controls are in `src/components`. Screens otherwise contain substantial inline styling and business logic. | The visual language is reusable, but component boundaries and testability are limited. | Medium |
| Native build model | `app.json` is the source configuration, while an `android/` project is present locally but ignored by Git (`.gitignore`). | A clean checkout cannot reproduce the exact native project that was reviewed; native changes can silently disappear. | High |

### Expo / React Native configuration

- **Path:** `package.json`, `app.json`, `tsconfig.json`
- **What it does:** Uses Expo `~54.0.37`, React Native `0.81.5`, React `19.1.0`, TypeScript strict mode, Hermes and the New Architecture in the present Android project. `app.json` specifies portrait/dark mode, package ID `com.nelvyn.ryqen`, and only the `expo-audio` config plugin.
- **Why it matters:** The installed React/React Native versions align with the Expo SDK 54 version matrix (SDK 54 targets RN 0.81 and React 19.1). The root-level `bundleIdentifier` in `app.json` is redundant/non-canonical; platform identifiers are correctly set under `ios.bundleIdentifier` and `android.package`.
- **Severity:** Low for the redundant field; see Android and notification findings for material configuration issues.

## B. Current features

| Feature | Paths / components | What currently works | Severity |
| --- | --- | --- | --- |
| Email/password auth | `src/screens/LoginScreen.tsx`, `src/lib/supabase.ts`, `App.tsx` | Sign-up, sign-in, persisted session, auth-state listener, and sign-out. | Medium |
| Onboarding | `src/components/OnboardingFlow.tsx` | Six-step collection of identity, date of birth/gender, body metrics, lifestyle, goals, and self-described weaknesses. It writes profile and character completion flags. | Medium |
| Ability assessment | `src/components/AbilityAssessment.tsx`, `src/utils/stats.ts`, `src/constants/skills.ts` | Captures self-assessed capabilities and converts them to five static combat-stat values. | Medium |
| Daily quests | `src/hooks/useHunterData.ts`, `src/screens/HomeTab.tsx`, `src/constants/quests.ts` | Generates four daily quests selected from pools biased toward the three lowest character stats plus one random stat; stores completion status. | Critical because of its XP interaction |
| Progress display | `src/utils/xp.ts`, `HomeTab.tsx`, `StatsTab.tsx` | Displays total XP, level, rank card, quest count, and level-up animation. | Critical because values are inconsistent/unsafe |
| Streak / shields | `useHunterData.ts` | Credits a day when all current quests are completed, grants a shield every five credited days up to three, and handles a later day transition. | High |
| Hydration | `src/components/WaterTracker.tsx`, `DailySummaryRow.tsx` | Logs preset water amounts, sums daily logs, derives a weight/activity-based target, supports undo, and adds a gyroscope visual. | Medium |
| Focus / meditation | `src/components/FocusTimer.tsx`, `ToolsTab.tsx` | Configurable timers, persisted saved presets, local timer/pause/resume, completion sound, persisted sessions, aggregate history, and a client-calculated XP award. | High |
| Profile and avatar | `src/screens/ProfileTab.tsx` | Reads/edits profile, weakness, ability, notification preferences, name, and uploads an avatar to `avatars`. | High |
| Notifications | `src/utils/notifications.ts`, `ProfileTab.tsx` | Requests permission and schedules/cancels one daily local notification. | Medium |

## C. Database and data model

### Repository status and limitation

**Finding C1 — no reproducible Supabase schema**

- **Path:** `supabase/`; only `supabase/config.toml` is tracked. No `supabase/migrations`, SQL schema/seed files, generated types, Edge Functions, or policy definitions are present.
- **What it currently does:** The app assumes a live database already has its tables, columns, defaults, constraints, triggers, storage bucket, and RLS policies.
- **Why it matters:** This makes deploys, new environments, reviews, recovery, RLS verification, and schema evolution non-reproducible. It also prevents confirmation that client assumptions match database constraints.
- **Severity:** Critical

The table model below is inferred from application queries only; column types, primary/foreign keys, defaults, indexes, RLS, triggers, and retention are **unknown**.

| Inferred resource | Observed columns / use | Persistence assessment |
| --- | --- | --- |
| `characters` | `user_id`, `name`, `rank`, `title`, `str`, `int`, `vit`, `agi`, `endurance`, `total_xp`, `level`, `onboarding_complete`, `last_quest_date`, `current_streak`, `longest_streak`, `streak_shields`, `streak_credited_date` | Primary character/progression record. Persisted, but client-authoritative and not safely updated. |
| `hunter_profile` | `user_id`, name/body/demographic fields, goals, activity/sleep/equipment/occupation, weaknesses, avatar URL, notification preference and time, onboarding marker | Persisted. It duplicates `characters.name` and may duplicate onboarding status. |
| `hunter_abilities` | `user_id`, `assessment_complete`, one column for each key in `src/constants/skills.ts` | Persisted self-assessment source from which combat stats are derived. |
| `quests` | `id`, `user_id`, `title`, `difficulty`, `xp`, `stat`, `status`, `date` | Persisted daily quest rows; older rows are apparently retained and used to count all completed quests. |
| `water_logs` | `id`, `user_id`, `amount_ml`, `date`, `logged_at` | Persisted hydration events. |
| `focus_sessions` | `user_id`, `duration_minutes`, `type`, `date` | Persisted completed timer events, but no XP-award event/idempotency marker. |
| `saved_timers` | `id`, `user_id`, `label`, `type`, `hours`, `minutes`, `seconds`, `is_default`, `created_at` | Persisted timer presets. |
| Storage bucket `avatars` | object path `${userId}/avatar.${extension}` and public URL | Persisted avatar files; bucket and object policies are not available in the repository. |

### Persistent versus local business state

| Data | Where it is stored now | Consequence |
| --- | --- | --- |
| Auth session | Supabase token persisted in device `AsyncStorage`; Zustand mirrors it in memory | Survives restart, but is not encrypted at rest by this app. |
| Character, profile, abilities, quests, water logs, focus sessions, saved timers, streak fields | Supabase | Intended business data is server-persisted, assuming writes actually succeed. Most calls ignore errors. |
| Current XP, quest list, character display, streak event, modal state, active tab | React state, then selected fields are asynchronously copied to Supabase | UI can diverge from server. XP is especially vulnerable to overwrites/races. |
| Running timer, pause time, timer start/end refs | Component memory only | App termination/reload loses an active session; it cannot be recovered or verified. |
| Notification delivery schedule | Local OS notification scheduler; preference/time are also stored in `hunter_profile` | Moving device/reinstalling/clearing local schedules does not restore reminders on launch. |

## D. User journey

1. `App.tsx` asks Supabase for a stored session. While this request is pending, `loading` exists in Zustand but is not used for rendering, so the login screen can briefly render before `MainApp`.
2. `LoginScreen` signs the user in or up with email/password. New registration messaging always says a confirmation email was sent, even though local Supabase config has email confirmation disabled.
3. `useHunterData.initCharacter` loads `characters`. If absent, it inserts blank `characters`, `hunter_profile`, and `hunter_abilities` rows sequentially, then shows onboarding.
4. `OnboardingFlow.finish` updates profile and character separately. It then opens `AbilityAssessment`.
5. `AbilityAssessment.finish` upserts ability answers, derives baseline stats locally, updates `characters`, and calls `loadQuests`.
6. Home presents four quests, static combat stats, current rank/title from the database, level from current in-memory XP, hydration/focus summaries, and streaks.
7. Toggling a quest changes its row status, recalculates XP incorrectly, and may credit/uncredit the streak.
8. Tools allow water logging and focus/meditation. A completed timer creates a `focus_sessions` row and adds XP locally.
9. Profile permits direct editing of most personal data, abilities/combat stats, avatar, notification preferences, and sign-out.

**Finding D1 — first generated quests can use stale default stats**

- **Path:** `src/screens/MainApp.tsx`, `AbilityAssessment` completion callback; `src/hooks/useHunterData.ts`, `loadQuests()`.
- **What it currently does:** The callback calls `setCharacter(...stats)` and immediately calls the hook function `loadQuests()`. React state has not yet updated in that closure, so `loadQuests` can read `character.stats` from the previous render—usually `DEFAULT_CHARACTER.stats`.
- **Why it matters:** The first daily quest set may not be based on the completed ability assessment, which defeats the intended personalized quest selection.
- **Severity:** High

**Finding D2 — onboarding writes are non-atomic and failure-blind**

- **Path:** `src/components/OnboardingFlow.tsx`, `finish`; `src/hooks/useHunterData.ts`, `initCharacter`.
- **What it currently does:** Creates/updates related character/profile/ability records with separate calls and ignores returned errors, then advances UI state regardless.
- **Why it matters:** A partial network/database failure can leave an account appearing onboarded while required records or completion flags are missing.
- **Severity:** High

**Finding D3 — profile name has two mutable sources of truth**

- **Path:** `src/screens/ProfileTab.tsx`, `saveName`; `characters.name` and `hunter_profile.name`.
- **What it currently does:** Writes name to two tables manually; home uses character name while profile uses profile name.
- **Why it matters:** Any partial failure or other client path can leave contradictory identity data.
- **Severity:** Medium

## E. XP and progression behaviour

### Exact current XP flow

1. **Canonical-looking storage:** `characters.total_xp` is read by `useHunterData.initCharacter()` and copied to the hook’s `xp` state.
2. **Persistence writer:** the `useEffect([xp])` in `useHunterData.ts` writes `{ total_xp: xp, level: calcLevel(xp) }` directly to `characters`. It neither awaits/serializes writes nor checks errors.
3. **Quest formula actually applied:** `HomeTab.toggleQuest()` maps current in-memory **today’s** quests, sums `xp` for every quest whose `status === 'completed'`, and calls `setXp(totalEarned)`. It does not add/subtract from existing lifetime XP.
4. **Focus/meditation formula:** `FocusTimer.handleComplete()` gives `Math.round(configuredSeconds / 60) * 5` XP. `ToolsTab` then calls `setXp(xp + xpEarned)` using the `xp` prop captured by that render.
5. **Level formula:** `calcLevel(totalXp) = floor(totalXp / 200) + 1`; `calcXpIntoLevel` and progress percentage use the same fixed 200-XP level size.
6. **Rank display:** rank/title are read from `characters` once. No code invokes `getRankFromXP`, recalculates rank/title, or persists rank changes when XP changes.

### Critical XP findings

**Finding E1 — quest interaction overwrites previously earned lifetime XP**

- **Path:** `src/screens/HomeTab.tsx`, `toggleQuest`; `src/hooks/useHunterData.ts`, XP persistence effect.
- **What it currently does:** On every toggle, XP becomes the sum of currently completed quests in the active day’s in-memory quest list. That value is then asynchronously written to `characters.total_xp`.
- **Why it matters:** Example: a hunter at 8,000 XP completes a 120-XP quest and is set to 120 XP, losing 7,880 XP. Unchecking the last completed quest sets XP to 0. This directly answers the audit question: **yes, UI/state logic can and does overwrite previously earned XP.**
- **Severity:** Critical

**Finding E2 — focus XP can overwrite quest XP or lose a concurrent focus award**

- **Path:** `src/screens/ToolsTab.tsx`, `onSessionComplete`; `src/hooks/useHunterData.ts`, XP persistence effect.
- **What it currently does:** Adds focus XP with `setXp(xp + xpEarned)` using a stale prop rather than a functional/transactional update. Each resulting state change independently writes `total_xp`.
- **Why it matters:** If another XP update happens before this callback is rendered again, the captured value can overwrite it. Network requests from the persistence effect can also finish out of order and leave the database at an older XP amount.
- **Severity:** Critical

**Finding E3 — there is no XP ledger, idempotency, or trusted award calculation**

- **Path:** `src/components/FocusTimer.tsx`, `handleComplete`; `src/screens/HomeTab.tsx`, `toggleQuest`; `src/hooks/useHunterData.ts`.
- **What it currently does:** Stores only a mutable aggregate (`characters.total_xp`). Quest values and timer duration are supplied by the client; no `xp_events`/award record, RPC, trigger, uniqueness rule, or server calculation is present in this repository.
- **Why it matters:** The system cannot audit, repair, deduplicate, reconcile, or safely enforce XP. A client can attempt arbitrary updates through the public API unless database policy/triggers prevent it (not auditable here).
- **Severity:** Critical

**Finding E4 — level/rank systems are internally contradictory and rank never progresses**

- **Path:** `src/utils/xp.ts`; `src/constants/theme.ts`; `src/constants/ranks.ts`; `src/screens/StatsTab.tsx`; `src/hooks/useHunterData.ts`.
- **What it currently does:** Level is every 200 XP. `theme.ts` renders rank thresholds E/D/C/B/A/S at 0/10k/30k/75k/175k/400k. Unused `ranks.ts` instead defines 0/1k/5k/15k/40k/100k. The UI reads `character.rank`, never updates it, and uses the theme thresholds; `getRankFromXP()` is unused.
- **Why it matters:** Rank progress can be negative or nonsensical relative to the persisted rank, and a user can never rank up through current app logic. There is no single progression specification.
- **Severity:** High

**Finding E5 — legacy/conflicting character types obscure the real progression schema**

- **Path:** `src/types/index.ts`, `Character`; `src/types/character.ts`, `Character`.
- **What it currently does:** The actively imported type is a display-only character with `rank: string`. A separate unexported/unused interface expects `current_xp` and `xp_to_next_level`, while runtime code uses `total_xp` and no `xp_to_next_level`.
- **Why it matters:** Future code can target the wrong column model, and TypeScript does not protect the actual Supabase payloads because they are untyped.
- **Severity:** High

**Finding E6 — quests and timers change XP but never improve combat stats**

- **Path:** `src/utils/stats.ts`; `HomeTab.tsx`; `FocusTimer.tsx`.
- **What it currently does:** Combat stats are only baseline values recalculated from self-assessment. Completing a STR quest or END focus session adds only XP, not the associated stat.
- **Why it matters:** The UI’s quest stat labels imply progression that does not exist. This is a product-model ambiguity that must be settled before adding features.
- **Severity:** Medium

## F. Important bugs and data consistency problems

**Finding F1 — streak calculations are client-side, mutable, and race-prone**

- **Path:** `src/hooks/useHunterData.ts`, `checkStreakForToday` and `loadQuests`.
- **What it currently does:** Credits/uncredits immediately from the current hook closure; day transition later compares date strings and consumes/reset shields. It applies separate database updates without transactions, locks, or an activity history.
- **Why it matters:** Rapid toggles, multiple devices, offline retries, midnight/time-zone differences, or concurrent updates can duplicate/undo streaks and shields. The system also defines a day through client locale/time rather than an authoritative user timezone.
- **Severity:** High

**Finding F2 — quest generation and all business writes silently ignore errors**

- **Path:** `src/hooks/useHunterData.ts`, `loadQuests`; `HomeTab.tsx`; `FocusTimer.tsx`; `WaterTracker.tsx`; `ProfileTab.tsx`.
- **What it currently does:** Most `insert`, `update`, and `delete` calls are awaited but their `error` result is discarded. UI state is often updated even if the write failed.
- **Why it matters:** A denied RLS request, loss of network, validation failure, or conflict can show false completion/progress and make later reloads appear to "lose" user data.
- **Severity:** High

**Finding F3 — duplicate default saved timers are possible**

- **Path:** `src/components/FocusTimer.tsx`, `loadSavedTimers`.
- **What it currently does:** When the select returns no rows, it inserts four defaults. There is no uniqueness constraint visible or client-side idempotency.
- **Why it matters:** Concurrent mounts/devices or a retry can create duplicate default presets.
- **Severity:** Medium

**Finding F4 — active focus/meditation sessions are not durable**

- **Path:** `src/components/FocusTimer.tsx`, timer refs/state.
- **What it currently does:** Stores the running session only in component memory; only a completion creates `focus_sessions`.
- **Why it matters:** Killing/reloading the app loses the session. Conversely, an unverified client can wait/tamper with time and receive an award when the timer completes.
- **Severity:** High

**Finding F5 — Home shortcuts do not target the requested tool**

- **Path:** `src/screens/MainApp.tsx`, `toolsFocusTarget`; `src/screens/ToolsTab.tsx`.
- **What it currently does:** Home sets a target of `water` or `focus`, but `ToolsTab` receives neither the value nor a scroll/focus instruction.
- **Why it matters:** The shortcut only switches tabs; the apparently designed deep-link behaviour is unfinished dead state.
- **Severity:** Low

**Finding F6 — profile DOB and numeric inputs are insufficiently validated**

- **Path:** `src/components/OnboardingFlow.tsx`, `finish`; `src/screens/ProfileTab.tsx`, `saveBody` and `saveGoals`.
- **What it currently does:** Checks only non-empty date strings/length, accepts impossible dates, and computes age from parsed values. Inputs such as `90+` are passed through `parseInt`; invalid DOB can generate invalid values.
- **Why it matters:** Bad personal data can corrupt hydration goal calculations and produces inconsistent profile fields.
- **Severity:** Medium

**Finding F7 — notification configuration is not restored and may lack required native configuration**

- **Path:** `src/utils/notifications.ts`; `src/screens/ProfileTab.tsx`; `app.json`; `android/app/src/main/AndroidManifest.xml`.
- **What it currently does:** Saves preference/time in Supabase only when edited and schedules a local notification on that device. It does not schedule at app start. The manifest reviewed lacks `POST_NOTIFICATIONS`, and `app.json` does not configure the `expo-notifications` plugin/icon even though `assets/images/notification-icon.png` exists.
- **Why it matters:** Reminders can disappear after reinstall/device migration and may not receive notification permission/configuration in a prebuilt Android app. This must be verified against a generated release build before launch.
- **Severity:** Medium

**Finding F8 — hydration UI can report a successful log after a failed insert**

- **Path:** `src/components/WaterTracker.tsx`, `logWater` and `undoLast`.
- **What it currently does:** Changes totals after unverified insert/delete operations. It does not reset `loading` in a `finally` block.
- **Why it matters:** A failure can leave a permanently disabled control or a total that disagrees with persistent data.
- **Severity:** Medium

**Finding F9 — profile image upload can leave stale files and is memory-heavy**

- **Path:** `src/screens/ProfileTab.tsx`, `pickPhoto`.
- **What it currently does:** Reads an image as base64, creates an in-memory byte array, uploads to an extension-dependent path with `upsert`, and stores a public URL. Changing JPEG to PNG leaves the old extension object; no file size/type enforcement is visible.
- **Why it matters:** This can leak orphaned avatars, consume memory on large photos, and relies entirely on Storage policy for authorization.
- **Severity:** Medium

## G. Security concerns

**Finding G1 — authorization cannot be verified and sensitive business records are directly client-writable**

- **Path:** `src/lib/supabase.ts`; all `supabase.from(...)` calls; missing `supabase/migrations`/policy files.
- **What it currently does:** Ships an `EXPO_PUBLIC_SUPABASE_ANON_KEY` (normal for Supabase clients) and lets the mobile client select/insert/update/delete character, profile, ability, quest, hydration, focus, and timer data.
- **Why it matters:** The anon key is not itself a secret; RLS is the security boundary. Because RLS and Storage policies are absent, it is impossible to prove users are limited to their own rows/objects or that values such as XP cannot be forged. If policies are permissive, this is an account/data-integrity exposure.
- **Severity:** Critical

**Finding G2 — progression integrity is trusted to an untrusted client**

- **Path:** `src/screens/HomeTab.tsx`, `src/components/FocusTimer.tsx`, `src/hooks/useHunterData.ts`.
- **What it currently does:** The device calculates XP, marks quests completed, supplies durations, and writes aggregate XP.
- **Why it matters:** Even correct RLS normally only proves row ownership, not that an XP award was legitimately earned. A modified client/API request could claim arbitrary rewards without server-side validation.
- **Severity:** Critical

**Finding G3 — auth tokens use unencrypted application storage**

- **Path:** `src/lib/supabase.ts`.
- **What it currently does:** Configures Supabase Auth to persist refresh/session tokens in `@react-native-async-storage/async-storage`.
- **Why it matters:** AsyncStorage is not a dedicated encrypted credential store. This increases exposure on compromised/backed-up devices; the reviewed Android manifest also has `allowBackup="true"`.
- **Severity:** Medium

**Finding G4 — avatar URLs are intentionally public, but access policy is unknown**

- **Path:** `src/screens/ProfileTab.tsx`, `pickPhoto`; inferred bucket `avatars`.
- **What it currently does:** Calls `getPublicUrl` and stores the resulting public URL in profile data.
- **Why it matters:** Avatar images are publicly addressable if the bucket is public. The source lacks object ownership/path policy definitions, upload constraints, or a deletion lifecycle.
- **Severity:** High

**Finding G5 — Android permissions and release signing need release review**

- **Path:** `android/app/src/main/AndroidManifest.xml`; `android/app/build.gradle` (present but ignored).
- **What it currently does:** Declares Internet, audio record/modify, external storage read/write, system alert window, vibration, and allows backups. The `release` build type signs with the standard debug keystore.
- **Why it matters:** Unneeded permissions expand privacy/review surface, and a release artifact signed with the debug key is not a production signing setup. Since `android/` is ignored, these settings are not versioned/reproducible.
- **Severity:** High

**Finding G6 — secret handling is generally on the right path, but has no validation guard**

- **Path:** `.env` (ignored), `.gitignore`, `src/lib/supabase.ts`.
- **What it currently does:** The local environment file contains only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; it is ignored and no service-role key was found in tracked source. Non-null assertions pass missing values straight into `createClient`.
- **Why it matters:** The public-prefixed values are expected client configuration, not server secrets. Startup validation is still needed eventually to avoid confusing production failures. Do not place a service-role key in Expo public environment variables.
- **Severity:** Low

## H. Technical debt

**Finding H1 — no automated test suite, lint script, CI workflow, or backend contract test**

- **Path:** `package.json`; repository file inventory; `.github/` contains only Copilot instructions.
- **What it currently does:** Provides start/platform scripts only. No `test`, `lint`, Jest/Vitest, E2E, migration validation, or CI configuration is present.
- **Why it matters:** High-risk progression, dates, authentication, and data writes have no regression protection. TypeScript compilation passes, but it cannot detect behavioural defects documented here.
- **Severity:** High

**Finding H2 — untyped Supabase payloads and pervasive `any` bypass strict TypeScript**

- **Path:** `src/lib/supabase.ts`; `ProfileTab.tsx`; `AbilityAssessment.tsx`; `utils/stats.ts`; `FocusTimer.tsx`; `PickerColumn.tsx`.
- **What it currently does:** Uses untyped client responses and `any` for profile, ability values, payloads, events, and timer refs.
- **Why it matters:** Schema drift such as `total_xp` versus `current_xp` is not caught at build time, despite `strict: true`.
- **Severity:** High

**Finding H3 — two conflicting rank models and one unused model remain**

- **Path:** `src/constants/theme.ts`; `src/constants/ranks.ts`.
- **What it currently does:** Duplicates rank ordering/thresholds with materially different values; `ranks.ts` is unused.
- **Why it matters:** It is already causing inconsistent semantics and will make future migrations/error fixes dangerous.
- **Severity:** High

**Finding H4 — generated Android source is ignored while used by platform scripts**

- **Path:** `.gitignore`; `android/`; `package.json`.
- **What it currently does:** Ignores `/android`, yet `npm run android` uses `expo run:android` against the locally present project.
- **Why it matters:** The codebase mixes managed configuration with untracked native state. A clone can build differently, and important generated config (including signing/permissions) cannot be code-reviewed through Git history.
- **Severity:** High

**Finding H5 — dependencies contain unused/deprecated overlap**

- **Path:** `package.json`; source import inventory.
- **What it currently does:** `expo-av`, `expo-asset`, `expo-font`, and `expo-status-bar` have no source imports. `expo-audio` is used; Expo SDK 54 documentation marks the `expo-av` Audio/Video APIs deprecated in favour of `expo-audio`/`expo-video`.
- **Why it matters:** Extra packages enlarge maintenance/update surface and confuse the platform direction.
- **Severity:** Low

**Finding H6 — component logic is overly coupled to rendering**

- **Path:** `HomeTab.tsx`, `ProfileTab.tsx`, `FocusTimer.tsx`, `WaterTracker.tsx`.
- **What it currently does:** Components own API calls, validation, calculations, side effects, animations, and rendering.
- **Why it matters:** It makes error handling, offline behaviour, unit testing, and future screen reuse difficult. `ProfileTab.tsx` in particular is a large multi-domain component.
- **Severity:** Medium

**Finding H7 — external audio is a runtime dependency**

- **Path:** `src/components/FocusTimer.tsx`, `useAudioPlayer('https://actions.google.com/...')`.
- **What it currently does:** Loads completion audio from a third-party URL rather than a bundled asset.
- **Why it matters:** Completion sound reliability depends on network availability and a third-party resource; it adds a needless external request/privacy dependency.
- **Severity:** Low

**Finding H8 — project identity and operational configuration are inconsistent**

- **Path:** `package.json` (`name: "zenthfresh"`), `app.json`/Android (`Ryqen`), `supabase/config.toml` (`project_id = "Ryqen"`).
- **What it currently does:** Uses different project names across package, app, and local Supabase configuration.
- **Why it matters:** This causes confusion in CI, release artifacts, package registries, diagnostics, and future service integrations.
- **Severity:** Low

## I. Things worth keeping

| Asset | Paths | Why retain it | Severity |
| --- | --- | --- | --- |
| Clear Expo SDK 54 baseline | `package.json`, `app.json`, `tsconfig.json` | Core versions are aligned with the SDK 54 matrix and TypeScript strict mode compiles cleanly. | Low |
| Simple app ownership boundary | `App.tsx`, `MainApp.tsx`, `useHunterData.ts` | The app is small enough to stabilize without a redesign; the hook is a sensible starting point for central domain coordination. | Low |
| Design tokens and reusable primitives | `src/constants/theme.ts`, `styles.ts`, `components/EditModal.tsx`, `PickerColumn.tsx` | Gives the UI a consistent dark system style and prevents a redesign from being necessary for Phase 1. | Low |
| Event-like activity tables | inferred `quests`, `water_logs`, `focus_sessions` | Storing individual quest/water/focus records is a good foundation for history and eventual server-side progression calculations. | Low |
| Self-assessment-to-stat calculation | `src/constants/skills.ts`, `src/utils/stats.ts` | The data-driven skill list and deterministic stat mapping are understandable and can be formalized/tested. | Low |
| Daily quest personalization intent | `QUEST_POOL`, `useHunterData.loadQuests` | Selecting work from lower stats is a useful gameplay premise once the stale-state and integrity problems are addressed. | Low |
| Local notification abstraction | `src/utils/notifications.ts` | Permission/schedule logic is isolated, so it can be corrected without redesigning profile UI. | Low |

## J. Things that should eventually be replaced or consolidated

| Replace/consolidate | Paths | Target direction | Severity |
| --- | --- | --- | --- |
| Mutable aggregate XP updates | `HomeTab.tsx`, `ToolsTab.tsx`, `useHunterData.ts` | A server-authoritative XP event ledger plus transactional/RPC award processing and derived aggregate. | Critical |
| Duplicate rank constants | `theme.ts`, `ranks.ts` | One versioned progression specification shared by server and client. | High |
| Display/domain types | `types/index.ts`, `types/character.ts`, untyped Supabase client | Generated database types plus explicit domain/view models. | High |
| Direct component database calls | screens/components | Repository/domain operations with error handling, invalidation, and tests. | High |
| Manual record bootstrapping | `initCharacter` | Atomic account bootstrap (database trigger/function or one transaction-like RPC), backed by migrations. | High |
| Client-only timer award | `FocusTimer.tsx` | Durable session state and a server-validated completion/award model, appropriate to product trust requirements. | High |
| Ignored Android project | `.gitignore`, `android/` | Deliberately managed native source committed to Git, or a fully reproducible prebuild workflow with generated sources excluded. | High |
| `AsyncStorage` token adapter | `supabase.ts` | Secure credential storage for mobile sessions, after validating Supabase/Expo SDK 54 integration requirements. | Medium |
| Runtime remote bell sound | `FocusTimer.tsx` | Bundled, licensed local audio asset or an optional user-controlled sound. | Low |
| `expo-av` and unused packages | `package.json` | Remove after verifying no native/config reliance; use Expo’s current split audio/video packages. | Low |

## K. Recommended priorities

1. **Stop data loss before feature work.** Establish the intended XP/rank/stat rules, freeze unsafe awards, introduce a ledger and server-side award operation, and reconcile affected `characters.total_xp` values from available history where possible.
2. **Bring the Supabase backend into source control.** Capture migrations, schema, constraints, RLS, Storage policies, bucket definitions, and generated types. Review all user-owned table/object policies before any distribution.
3. **Make character/activity writes reliable.** Define a canonical character/profile model, bootstrap users atomically, add error handling and recovery, and make quest/streak/time-zone logic deterministic and server-safe.
4. **Lock down the mobile release surface.** Decide managed versus committed-native workflow; review permissions, debug signing, backup behaviour, Expo notification plugin configuration, and secure session storage.
5. **Add a safety net.** Add unit tests for XP/rank/streak/date/stat calculations, integration tests for data operations/RLS, and CI for typecheck, tests, dependency/config validation, and migrations.
6. **Then improve maintainability.** Split data operations from rendering, remove dead packages/code, consolidate constants/types, and restore durable notification/timer behaviours.

## Proposed Phase 1 implementation plan

This is a plan only; it has not been implemented in this audit.

1. **Baseline and protect data**
   - Back up the live Supabase schema/data and obtain the current RLS/Storage policy definitions.
   - Inventory affected accounts and determine whether historical `quests`/`focus_sessions` can reconstruct intended XP.
   - Write and approve one product specification for XP sources, per-source amounts, completion/reversal rules, level curve, ranks, stat gains, daily reset timezone, streak/shield rules, and timer trust model.

2. **Version the backend**
   - Add an initial migration representing the existing production schema, keys, indexes, constraints, triggers/functions, buckets, and RLS policies.
   - Add generated Supabase database types and a documented local/preview/production environment process.
   - Establish ownership and integrity constraints for every inferred table and the avatar object path.

3. **Rebuild progression safely without UI redesign**
   - Add immutable XP event records with source, amount, subject record, timestamp, and unique idempotency key.
   - Move award/reversal/aggregate/level/rank calculation into a transaction-safe Supabase RPC/function (or equivalent server-side operation). The client should request an action and render returned authoritative state.
   - Consolidate rank thresholds and character types; remove/retire the conflicting model only after migration coverage.
   - Reconcile existing totals and deploy a one-time, reviewed repair migration if data history supports it.

4. **Stabilize user/activity workflows**
   - Make account initialization atomic and handle all failures visibly/retryably.
   - Make assessment completion pass its computed stats explicitly into quest generation; put quest creation, daily rollover, and streak/shield transitions behind authoritative date/time rules.
   - Persist/recover timer lifecycle as required by the product, and make notification scheduling/configuration reliable on Android.

5. **Release hardening and verification**
   - Use a reproducible Android strategy; remove unneeded permissions, fix production signing and backup policy, and validate a release build.
   - Move session credentials to secure storage if compatible with the chosen SDK 54 setup.
   - Add automated tests first for the critical XP/streak/date cases, then integration/RLS tests; add CI before resuming feature expansion.

