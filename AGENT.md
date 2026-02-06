# CLAUDE.md

use the baseprompt from AI.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Darc is an experimental next-generation browser built on Xenon and Svelte. It combines cutting-edge browser UI concepts from Arc, stacked browsing, and agentic browsers. The project focuses on UI innovation and expects high resource usage (10s-100s MB per day, 2GB+ memory).

## Development Setup

### Important Rules
- **NEVER run `npm run build`** - The user manages builds manually
- **Dtach is NOT used** - Do not attempt to use dtach sessions
- The development server runs externally; do not start/stop it

## Development Commands

### Core Development
- `npm run dev` - Start development server on port 5193 (managed externally by user)
- `npm run bump-version` - Increment version using bump_version.js

### DO NOT RUN
- `npm run build` - Never run this command
- dtach commands - Not used in this project

### Testing
- Tests are located in `/test` and `/tests` directories
- Main test runner: `tests/main.js`
- Tab sidebar tests: `tests/tab-sidebar.js`
- In-browser testing utilities: `app/lib/inBrowserTesting.js`

### Multi-Environment Setup
The project supports multiple deployment targets:
- **Standard web app**: Vite development server
- **Cloudflare Workers**: Uses workerd runtime in `/workerd` directory
- **Isolated Web App**: Special chrome://isolated-app protocol support
- **Service Worker**: Registered in main.js for offline functionality

## Architecture

### Frontend Structure
- **Framework**: Svelte 5
- **Styling**: Tailwind CSS 4.x
- **Build**: Vite 6.x with custom plugins
- **Data**: PouchDB with IndexedDB adapter for local storage

### Core Components (`/app/components/`)
- `Frame.svelte` - Main frame rendering component
- `ControlledFrame.svelte` - Controlled frame API implementation
- `TabSidebar.svelte` - Tab management UI
- `NewTab.svelte` - New tab interface
- `Agent.svelte` - AI agent integration
- `Settings.svelte` - Application settings
- `Excalidraw.svelte` - Embedded drawing tool

### Data Management (`/app/data.svelte.js`)
- Uses PouchDB for local document storage
- Reactive state management with Svelte 5 runes
- Document indexing with custom sort order: `['archive', 'spaceId', 'type', 'order']`
- Bootstrap data initialization and conflict resolution

### Backend Services

#### Cloudflare Workers (`/workerd/`)
- **Agent Runtime**: `agent.ts` - AI agent processing with Anthropic Claude
- **Tools**: `tools.ts` - Agent tool implementations
- **Shared Types**: `shared.ts` - Common type definitions
- Uses `agents` package for request routing

#### Daemon (`/daemon/`)
- Background process management (currently empty main.js)

### Special Features
- **Trusted Types**: Full CSP compatibility with trusted types policy
- **Gesture Prevention**: Blocks pinch-to-zoom and gesture events
- **Keyboard Interception**: Custom Cmd+W/Ctrl+W handling
- **Multi-Protocol Support**: HTTP, isolated-app://, and service worker contexts

## Key Dependencies
- `@excalidraw/excalidraw` - Embedded drawing tool
- `@ai-sdk/anthropic` - AI agent capabilities
- `pouchdb-browser` - Local database
- `agents` - AI agent framework
- `streaming-markdown` - Real-time markdown rendering

## Development Notes

### Vite Configuration
- Custom plugins for link color patching and HTML injection
- Cloudflare integration with `@cloudflare/vite-plugin`
- Web bundle support (commented out in production)
- Custom alias for Excalidraw helpers

### Security
- Implements Content Security Policy with nonces
- Trusted Types policy for XSS prevention
- Isolated Web App as cire isolation thechnique for browser subcontext isolation

### File Structure Patterns
- `/app` - Main Svelte application
- `/workerd` - Cloudflare Workers runtime
- `/daemon` - Background services
- `/public` - Static assets including translations and icons
- `/functions` - Edge functions (CouchDB proxy)

## Controlled Frame API
The project implements the Controlled Frame specification (https://wicg.github.io/controlled-frame) for advanced iframe control and security.


## Comments
Do not make verbose comments unless needed to understand something not obvious. 
NEVER EVER remove existing comments or commented out code unless you added them in the current session.

## UI/UX Guidelines


### Event Handlers
- **Use `onmousedown` instead of `onclick`** for button and interactive element handlers. This provides faster perceived response times.

### Button Styling
- **Never use red/warning colors** for close, delete, or clear buttons unless explicitly instructed. These are normal operations and should use neutral colors (white/gray).

### Css Rules
- never use keyframe animation when a simple css transition works, never use js when css works


### Js Rules
- use const over let, use plain js over runes, use simple logic over effects. whenever the simpler and more error proof solution would work.
