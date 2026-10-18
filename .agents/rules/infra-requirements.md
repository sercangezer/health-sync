# Engineering & Agent Directives

## 1. Code Integrity, Anti-Cheating & Autonomous Verification
- **Complete Implementations Only:** Leaving placeholders such as `// TODO`, `/* implement later */`, empty function stubs, or mock API responses in production code is strictly forbidden. All logic must be wired up end-to-end.

- **Strict Anti-Cheating & Test Integrity (Zero-Trust):**
  - **Never Tamper with Tests:** Deleting, commenting out, or weakening assertions in existing tests to bypass pipeline failures is STRICTLY FORBIDDEN. If your new code breaks a test, fix your code—never the test.
  - **No Fake Assertions:** Writing trivial tests (e.g., `assert(true)`), over-mocking, or bypassing real execution logic to inflate test coverage is prohibited. Tests must assert real state changes, database mutations, and edge cases.
  - **No Error Suppression:** Catching exceptions silently (e.g., empty `try/catch` blocks) or using bypass flags just to keep logs clean is a critical violation. You must resolve the root cause.

- **Resilience-Driven Backend Testing:** Every new backend feature, API endpoint, bug fix, or state mutation MUST be accompanied by comprehensive unit and integration tests.
  - **Beyond the Happy Path:** Testing only successful scenarios is strictly prohibited. Tests must explicitly assert edge cases, boundary conditions, malformed payloads, unauthorized access, and expected failure modes (e.g., database timeouts).
  - **Deterministic Isolation:** External APIs, external databases, and non-deterministic logic must be strictly mocked. Integration tests must not pollute the global state (e.g., utilize transactional rollbacks).
  - Code is NEVER considered complete until the verification target (`make test`) passes successfully with the newly added test coverage.
- **Standardized API Responses:** The backend MUST NEVER leak internal stack traces or unhandled exceptions to the client. All API errors must return a strictly typed JSON structure containing "error_code", "message", and "details" (e.g., RFC 7807).
- **Pre-Push Execution & Log Audit (No Human Review):**
  - The human user will NOT review the code. You bear 100% responsibility for system stability.
  - Before generating any commit, you MUST conceptually or locally dry-run the newly added functionality to ensure it works correctly.
  - You MUST monitor the `stdout` JSON logs during execution. If ANY `"level": "ERROR"`, `"level": "FATAL"`, unhandled exceptions, or stack traces appear, you MUST abort the push, debug the root cause, and refactor the code.
- **Autonomous Commits:** You are authorized to commit and push automatically ONLY IF:
  1) The new feature is confirmed working,
  2) The log audit is completely clean (Zero errors),
  3) The verification targets (`make check` / `make test`) pass legitimately,
  4) The parity gate (`make contract-check`) passes and the Pre-Commit Parity Report (see Section 7) has no empty cells.
- **Zero-Secret Policy:** Hardcoding secrets, private keys, tokens, or environment-dependent URLs is strictly prohibited. All configuration must follow 12-Factor principles via environment variables. Sync new keys to `.env.example`.


## 2. Lifecycle & Infrastructure (Makefile Abstraction)
- **Single Point of Control:** All operations (build, run, test, lint, deploy, logs) MUST be executed exclusively through the `Makefile`.
- **Flexible Runtime:** The application must support reproducible deployment—either as a containerized service (Docker) or a standalone compiled binary—abstracted cleanly behind `make build` and `make run`.
- **Structured Logging (JSON):**
  - All logs must be written exclusively to standard output (`stdout`) as single-line JSON objects containing `timestamp` (ISO 8601), `level`, `component`, and `message`. File-based logging is forbidden.
  - Log level must dynamically read from `LOG_LEVEL` (defaulting to `INFO`). `DEBUG`/`TRACE` logs must not run in default production environments.
  - Provide a `make logs` target that streams application logs cleanly.
- **Non-Destructive Migrations:** Never alter the database schema manually or on-the-fly. All schema changes MUST be executed through strictly version-controlled migration scripts. Destructive operations (e.g., dropping columns) require explicit human approval.

## 3. Architecture & Documentation (`tech-arch/`)
- Maintain all technical architecture, schema decisions, and business logic inside the `tech-arch/` directory in Turkish using Markdown. Keep it continuously synchronized with code changes.
- Maintain a `tech-arch/prompt-for-ai.md` file designed to onboard, test, or migrate the codebase across alternative AI environments seamlessly.
- Maintain a `tech-arch/api-envanteri.md` file listing every endpoint together with its backend handler and its frontend consumer. Update it with every API change.

## 4. UI/UX, Design System & Visualizations
- **Goal:** This product is sold to enterprise and defense institutions. It must read as a mature, quiet, trustworthy business tool. Two looks are forbidden because both signal "AI-generated":
  - *Glossy SaaS:* gradients, glow, glass, oversized cards, big rounded shapes, decorative icons, marketing copy.
  - *Tactical HUD:* neon cyan on black, monospace everywhere, all-caps letter-spaced labels, scanlines, grid or radar backgrounds, corner brackets, blinking indicators, theatrical status text ("SYSTEM ONLINE").
  - When a case is not covered below, do what **IBM Carbon** or **Palantir Blueprint** would do, and choose the plainer option.
- **No Native Dialogs:** Default browser dialogs (`alert()`, `confirm()`, `prompt()`) are strictly prohibited. All user feedback, state alerts, and loaders must use asynchronous, internal components.
- **Semantic Design Tokens Only:** The token set below is closed. NEVER hardcode hex/rgb colors or add new color tokens. Exclusively consume CSS variables:
  - *Surfaces:* `--color-bg-base`, `--color-bg-surface`, `--color-bg-elevated`
  - *Borders:* `--color-border`
  - *Text:* `--color-text-main`, `--color-text-sub`, `--color-text-muted`
  - *Brand:* `--color-brand` (a muted, desaturated teal; never neon cyan)
  - *Status:* `--color-accent-green` (nominal/success), `--color-accent-gold` (warning), `--color-accent-red` (critical/destructive)
  - *Charts:* `--color-chart-1` … `--color-chart-6` (muted, similar lightness, distinguishable in both themes)
  - Color utilities that bypass the tokens (e.g. `bg-blue-500`, `text-gray-400`) are forbidden. Layout utilities are allowed only when mapped to the Fixed Scale Tokens.
- **Color Is Signal, Not Decoration:** Surfaces and text are neutral by default; color appears only where it carries meaning.
  - `--color-brand` is reserved for the primary action, active/selected state, focus ring, and links.
  - Status colors appear only in status indicators (dot, tag, inline icon, validation message). They are never used as fills for cards, headers, rows, or buttons, except the destructive button.
  - Status is never conveyed by color alone; always pair it with text or an icon.
  - Large brand-colored or status-colored areas are forbidden.
- **State Derivation:** Interaction states MUST be derived from existing tokens; opacity hacks and ad-hoc colors are forbidden.
  - *Hover:* one surface step up (`--color-bg-base` → `--color-bg-surface` → `--color-bg-elevated`). On `--color-bg-elevated`, hover uses `--color-bg-surface`.
  - *Selected / Active:* `--color-bg-elevated` plus a 2px `--color-brand` edge indicator. No brand-colored fill.
  - *Focus:* 2px `--color-brand` outline with 1px offset, visible on keyboard focus for every interactive element.
  - *Disabled:* `--color-text-muted` text, `--color-border` outline, no fill change, `cursor: not-allowed`.
- **Fixed Scale Tokens:** Sizes are fixed values, not ranges. Define them in the same central token file as the colors; raw px values in components are forbidden.
  - *Spacing:* `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-6: 24px`, `--space-8: 32px`.
  - *Radius:* `--radius-control: 2px` (buttons, inputs, tags), `--radius-container: 4px` (panels, modals, menus). Larger radius and pill shapes are forbidden (avatars and status dots excepted).
  - *Font size:* `--font-size-sm: 12px`, `--font-size-base: 14px`, `--font-size-lg: 16px`. No other sizes.
  - *Heights:* `--control-height: 32px`, `--table-row-height: 36px`.
- **Dual Theme (Dark & Light) Is Mandatory:**
  - Every screen, component, chart, modal, and state MUST work in both themes. Shipping a component that is correct in only one theme is forbidden.
  - All color tokens MUST be defined twice in a single central file, under `:root[data-theme="dark"]` and `:root[data-theme="light"]`. Components MUST NOT contain theme-specific logic, conditionals, or colors.
  - The initial theme follows the OS setting (`prefers-color-scheme`). The user can override it with a visible toggle in the application shell; the choice is persisted and applied before first paint.
  - Neither theme may use pure extremes: no pure white on pure black, no pure black on pure white. The light theme uses a warm, matte off-white.
  - Text, borders, brand, and status colors MUST meet WCAG AA contrast on every surface token in BOTH themes. Adjust token values per theme; do not reuse dark-theme values in the light theme blindly.
- **Visual Language:**
  - **Forbidden Effects:** Gradients (background, text, or border), glow, neon, glassmorphism / `backdrop-filter`, colored or large drop shadows, shimmer, animated or patterned backgrounds, decorative illustrations, and emojis.
  - **Flat Surfaces:** Depth is expressed ONLY by the surface tokens and a 1px `--color-border`. Shadows are allowed only on floating layers (modals, dropdowns, tooltips) and must be subtle and neutral.
  - **Density:** Compact, aligned layouts on the 4px grid. Oversized hero sections, giant headings, and card mosaics are forbidden. Data belongs in tables and aligned grids.
  - **Typography:** UI text and numbers use **IBM Plex Sans** with `font-variant-numeric: tabular-nums`. **IBM Plex Mono** is used ONLY for IDs, codes, coordinates, hashes, and log output. Maximum two weights (regular, semibold). Sentence case everywhere; all-caps and letter-spaced labels are forbidden (acronyms excepted).
  - **Motion:** Transitions are limited to 150ms or less on opacity and color. Bounce, spring, scale-on-hover, parallax, pulsing, and entrance animations are forbidden. Respect `prefers-reduced-motion`.
  - **Copy Tone:** Terse, literal, and plain. No marketing language, exclamation marks, friendly filler ("Welcome back!", "Oops!"), or dramatic jargon.
- **Iconography:** Exclusively use **Material Symbols** in the outlined variant, at one weight and one size (20px), colored with text tokens. Mixing icon libraries is prohibited. Icons inside colored circles or tinted badges are forbidden. Icons accompany labels; they do not decorate headings or metrics.
- **Offline / Air-Gapped Assets:** The application runs on a closed network. At runtime it MUST NOT request any external origin.
  - Fonts and Material Symbols MUST be self-hosted from the project (`/assets/fonts`, woff2) with local `@font-face` rules.
  - CDNs, Google Fonts, remote images, external scripts, analytics, and telemetry are forbidden.
  - The build MUST fail if the output references an external URL for any asset.
- **Component Base:** Styled primitives (Button, Input, Select, Checkbox, Modal, Menu, Tooltip, Tabs, Table, Tag, Toast) are defined ONLY in `src/ui/`. Screens MUST consume them from there and MUST NOT define their own styled primitives or override their styles locally.
  - Primitives are built on **React Aria Components**; no other component library may be added.
  - Before creating a new primitive, check `src/ui/` and extend an existing one with a variant.
- **Application Shell:** Every authenticated screen renders inside one shared shell: fixed left sidebar (collapsible, icon + label), top bar (breadcrumb on the left; theme toggle and user menu on the right), and a full-width content area. Screens MUST NOT implement their own navigation or page chrome.
- **Page Templates:** Every screen MUST use one of the templates in `src/ui/templates/`:
  - *Dashboard:* page title and a global filter bar (time range, scope) with a "last updated" timestamp; one compact metric strip (label, value, change vs. previous period; no icons, no colored tiles); then charts and tables on an aligned grid. Every metric and chart links to the list it is computed from.
  - *List:* page title, toolbar (search, filters, primary action), data table, pagination.
  - *Detail:* title with status tag, action bar, label/value grid in sections, related tables in tabs.
  - *Form:* labels above fields, single column of max 640px, inline validation, sticky footer with primary and cancel actions.
- **Data Tables:** All tabular data uses the shared Table primitive, which MUST provide: column sorting, per-column filtering, column show/hide, pagination, sticky header, row selection with bulk actions, right-aligned numeric columns, and loading (skeleton rows), empty, and error states. Text is truncated with a tooltip, never wrapped.
- **Data Visualizations (Nivo):** All charts use the **Nivo** (`@nivo/*`) ecosystem through shared wrappers in `src/ui/charts/`.
  - The Nivo theme object MUST be derived from the active theme's tokens and update when the theme switches. Series colors come ONLY from `--color-chart-*`; Nivo's built-in color schemes are forbidden.
  - Set `animate: false`. Gradient fills, area glow, 3D, and decorative backgrounds are forbidden.
  - Prefer bar and line charts. Every chart has a title, axis labels with units, and a legend when it has more than one series. Maximum six series per chart.
  - Charts must include loading, empty, and error states.
- **Mandatory Verification Gates:** No human reviews this code, so compliance is proven by automated checks. A UI change is complete ONLY when all of the following pass in CI:
  - *Stylelint:* `color-no-hex`, `color-named: never`, and disallow lists that reject `rgb()/hsl()` literals, gradients, `backdrop-filter`, `text-transform: uppercase`, and `border-radius` above 4px outside the token file.
  - *ESLint:* `no-alert`, and `no-restricted-imports` blocking every icon and component library other than Material Symbols and React Aria Components.
  - *Visual tests (Playwright):* every primitive in `src/ui/` in all states (default, hover, focus, disabled, error, loading), and every screen in its default, empty, and error states, in BOTH themes. Unreviewed screenshot diffs fail the build.
  - *Accessibility (axe-core):* zero WCAG AA violations on every screen in BOTH themes.
  - *Network:* a Playwright check that fails if any request leaves the application origin.
  - Disabling, skipping, or weakening any of these checks to make a change pass is forbidden.

## 5. Versioning & Release Tracking
- Track current application version in a root `VERSION` file.
- Update `CHANGELOG.md` in Turkish upon every release, recording additions, fixes, and modifications.
- The website footer must display: `Version: v1.0.0 | Commit: COMMIT_ID`.
- Clicking the footer version must open an accessible modal rendering the parsed `CHANGELOG.md` markdown cleanly.
- Keep all external dependencies and runtimes pinned to their latest stable releases.

## 6. Data Integrity & State Safeguards
- **Temporal Baseline & Window Fallback:** When a state transition occurs (e.g., logging a new dose or cycle), historical metrics from previous cycles must NEVER bleed into or falsely associate with the new cycle before its measurement window officially opens. If a measurement window has not yet begun, the system must enforce strict baseline fallback guards—explicitly rendering uninitialized or pending states rather than borrowing stale values from previous cycles.
- **Strict Boundary Validation:** Aggregations, deltas, and trend visualizations must validate metric timestamps strictly against the active cycle's effective start window before projecting baseline comparisons.

## 7. Full-Stack Contract Parity (Backend ↔ Frontend)
- **Single Source of Truth:** The API contract lives in `api/openapi.yaml`. Every endpoint MUST be defined there BEFORE any backend or frontend code is written (contract-first).
- **Generated Client Only:** The frontend MUST call the backend exclusively through the typed client generated from the contract (`make gen-api`). Hand-written `fetch`/`axios` calls with raw URL strings are strictly forbidden.
- **Vertical Slice Definition of Done:** A feature is NEVER complete when only one layer is done. A user-facing change is complete only when ALL of the following exist in the same commit:
  1) Contract entry in `api/openapi.yaml`,
  2) Backend handler registered on the router, with tests,
  3) Regenerated frontend client,
  4) A frontend consumer (UI component/hook) that actually calls it, including loading, empty, and error states.
- **No Orphans (Both Directions):**
  - Every operation in the contract MUST have a registered backend handler AND at least one frontend consumer.
  - Every frontend API call MUST resolve to an existing contract operation with a real backend implementation. Mocking or stubbing a missing endpoint in the frontend is forbidden; implement the backend instead.
  - Endpoints that intentionally have no UI (webhooks, cron jobs, internal services) MUST be marked `x-internal: true` in the contract with a one-line justification.
- **Automated Parity Gate:** `make contract-check` MUST be part of `make check` and MUST fail when:
  - backend routes and the contract differ (missing or undocumented routes),
  - the generated client is stale (`make gen-api` produces a git diff),
  - a contract operation has no frontend usage and is not marked `x-internal`,
  - the frontend references an operation that is not in the contract.
- **Pre-Commit Parity Report:** Before every commit, list each endpoint touched as a table: `Endpoint | Backend handler | Backend test | Frontend consumer`. Any empty cell blocks the commit, unless the endpoint is marked `x-internal`.
- **Field-Level Parity:** When a request/response field is added, renamed, or removed, the contract, the backend, and every frontend consumer MUST be updated in the same commit. Frontend type-checking must pass against the regenerated client.

## 8. Permanent Git Branching, Self-Hosted CI/CD & PR Merge Rules
- **Mandatory Feature Branching:** Every change, feature, bug fix, or chore MUST be developed on a dedicated branch (`feat/...`, `fix/...`, `chore/...`, `gelistirme/...`) branched off `master` (or `main`). Committing or pushing directly to `master` is STRICTLY FORBIDDEN.
- **GitHub Actions & Self-Hosted Runner:** All repositories MUST execute CI checks via GitHub Actions (`.github/workflows/ci.yml`) running on the self-hosted runner (`runs-on: [self-hosted, linux, x64]`).
- **Pre-Push Local Verification:** Before pushing a branch or opening a Pull Request, all local verification gates (`make check`: `make lint`, `make contract-check`, `make ui-check`, `make test`) MUST pass with 100% success.
- **Strict PR Green Gate & No Auto-Merge:**
  - Using `gh pr merge --auto` (PR auto-merge) is STRICTLY FORBIDDEN.
  - After opening a Pull Request (`gh pr create --base master --head <branch>`), you MUST watch all GitHub Actions checks on the self-hosted runner until completion (`gh pr checks <PR_NO> --watch`).
  - A Pull Request MUST NEVER be merged into `master` unless 100% of CI checks have completed with `pass` (green). If any check fails or is still pending/running, halt the merge immediately, fix the root cause, and wait for 100% green checks.
- **Post-Merge Master CI Verification:** After all PR checks are 100% green and the PR is merged via `gh pr merge <PR_NO> --merge --delete-branch`, you MUST also watch the `push` workflow run triggered on `master` (`gh run watch <RUN_ID> --exit-status`) and verify it completes with 100% success.
- **Local Synchronization & Production Deployment:** Once the `master` CI run succeeds, synchronize the local repository (`git checkout master && git pull origin master`). Live production deployment (`make deploy`) may ONLY be executed from a verified, green `master` branch.