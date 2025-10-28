# CLAUDE.md

use the baseprompt from AI.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Darc is an experimental next-generation browser built on Xenon and Svelte. It combines cutting-edge browser UI concepts from Arc, stacked browsing, and agentic browsers. The project focuses on UI innovation and expects high resource usage (10s-100s MB per day, 2GB+ memory).

## Development Setup

### Shared Development Environment
The development server runs continuously in a detached session for efficient collaboration:
- **Dtach session**: Contains the running `npm run dev` server on port 5193 at `./dtach/darc`
- **Session reattachment**: Use `dtach -a ./dtach/darc` to view current console output and interact
- **Real-time monitoring**: Vite HMR updates and console logs are visible in the detached session
- **No need to start server**: Development server is most likely already running in watch mode, only start it after checking existing sessions and only using dtach yourself


### Console Monitoring
```bash
# Check if dtach session exists
ls -la ./dtach/darc 2>/dev/null && echo "Session exists" || echo "No session found"

# Attach to existing session (Ctrl+\ to detach)
dtach -a ./dtach/darc

# Create new session with shell
dtach -c ./dtach/darc zsh

# Create new session if needed (Ctrl+\ to detach)
dtach -c ./dtach/darc npm run dev

# Attach to existing session or create new one
dtach -A ./dtach/darc npm run dev
```

## Development Commands

### Core Development
- `npm run dev` - Start development server on port 5193 (already running in dtach session)
- `npm run build` - Build for production 
- `npm run preview` - Preview production build
- `npm run bump-version` - Increment version using bump_version.js

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