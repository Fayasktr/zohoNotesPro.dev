# Zoho Notes Pro — Frontend (React + TypeScript)

This directory is designated for the modern React SPA View Layer of Zoho Notes Pro.

## Planned Architecture
- **Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS + Lucide React
- **Code Editor:** `@monaco-editor/react`
- **Local-First Database:** Dexie.js (IndexedDB storage in browser)
- **Client Execution:** Pyodide (WASM for Python) + Web Workers (for JS/TS)
- **State Management:** Zustand + TanStack Query
- **Terminal:** `@xterm/xterm` (Connected via WebSocket to backend)

## Backend Connection
Connects to `../backend` running on `http://localhost:5000` (or `PORT`) for:
- User Authentication (JWT)
- Cloud Backup & Hydration (`/api/sync/*`)
- Server-side execution for C, C++, Java (`/api/execute` & `/ws/terminal`)
