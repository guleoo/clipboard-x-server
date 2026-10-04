# Web tests

Tests are grouped by the module or domain whose behavior they verify:

| Directory | Scope |
| --- | --- |
| `frame/` | Route engine, browser storage, date formatting, and Base UI contracts |
| `app/` | Application composition and route definitions, including translated titles |
| `components/` | Shared domain states, confirmation, refresh behavior, and formatting |
| `clipboard/` | Clipboard feed, cards, publication API, and transfer activity |
| `device/` | Device management, key API, and key-copy feedback |
| `configuration/` | Cleanup settings, language and UTC preferences, and their feedback |
| `auth/` | Login and administrator account behavior |
| `layout/` | Settings-menu actions and feedback |
| `i18n/` | Translation completeness, interpolation, plurals, and error messages |
| `support/` | Shared browser setup and feedback spies, not test cases |

Run from the repository root:

```bash
bun run --cwd web test
bun run --cwd web test ./tests/clipboard
bun run --cwd web test ./tests/components/refresh.test.tsx
```

Browser tests import `support/dom.ts` before dynamically importing React testing
utilities and UI modules. Register hooks in the calling test file; shared helpers
must not rely on being imported again for each file. Restore browser overrides,
spies, and application state after each test. Do not run shared-DOM tests concurrently.
