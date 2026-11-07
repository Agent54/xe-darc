# Sidebar browser tests

MCP checks:

- `deno test --no-check --allow-env --allow-read --allow-sys tests/mcp-permissions.test.js tests/permissions.test.js`
- `deno run --allow-env --allow-read --allow-sys --allow-write=./,/tmp --allow-ffi --allow-net --allow-run tests/mcp-worker.test.js`
- `deno run --allow-env --allow-read --allow-sys --allow-write=./,/tmp --allow-ffi --allow-net --allow-run tests/mcp-browser.js`

The MCP worker and browser tests start isolated Miniflare/workerd instances and use workspace-local build artifacts.

Run a suite with `deno run --allow-env --allow-read --allow-sys --allow-write=./,/tmp --allow-ffi --allow-net --allow-run tests/<suite>.js`. Each suite starts its own local
fixture server and headless Chromium session.

The former `favicon-browser.js` scenarios now have independent entry points:

| Suite | Coverage | Former flag |
| --- | --- | --- |
| `favicon-browser.js` | Favicon identity, fallback, loading/audio overlays, link favicons and activity sorting | `--audio-only`, `--activity-only` still supported |
| `tab-creation-browser.js` | Creation drags, cancellation, clicks, keyboard creation and hover suppression | `--creation-only` |
| `new-tab-menu-browser.js` | Clipboard previews, URL/search navigation, menu refresh, keyboard selection and container tabs | |
| `closed-tabs-preview-browser.js` | Automatic closed-tab previews, expiry and hidden sidebars | `--closed-tabs-preview-only` |
| `close-button-history-browser.js` | Close-button history delays, cancellation and retention | `--close-button-history-only` |
| `sidebar-layout-browser.js` | Header layout, window drag regions and control reachability | |
| `sidebar-pins-browser.js` | Pin dragging, transfers, sidebar sections and unpinning | `--pins-only` |
| `pin-modes-browser.js` | Pinned groups, manual pin order, Normal activation and Menu sizing/dismissal | |
| `sidebar-scroll-browser.js` | Sticky New Tab, crowded pins and active-tab scrolling | `--sidebar-scroll-only` |
| `sidebar-multi-space-browser.js` | Space navigation, new-tab-only spaces, search and full-width closing | |
| `tab-overrides-browser.js` | Custom titles, emoji, image icons and resets | `--tab-overrides-only` |
| `tab-title-browser.js` | Shared URL fallback, reactive titles and internal New Tab titles across tab surfaces | |
| `sidebar-hovercards-browser.js` | Hovercard gaps, responsive history, screenshots and metadata | |
| `sidebar-groups-browser.js` | Group activation previews, menus and resizing | |

Use the independent entry point in place of its former flag. Shared setup and
cleanup live in `sidebar-browser-fixture.js`.
