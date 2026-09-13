# 🚀 Zoho Notes Pro — Modern MVCS Backend (v2.0)

Production-grade, decoupled REST API and WebSocket Gateway built with **Express, Mongoose, JWT, and WebSockets** following strict **MVCS (Model-View-Controller-Service)** architecture.

Designed specifically for **local-first browser execution with real-time MongoDB Atlas cloud backup**.

---

## 🏛️ MVCS Architecture Breakdown

```
Full Project/backend/
├── app.js                          # Express application pipeline (< 50 lines)
├── server.js                       # Server entrypoint (HTTP + WS + MongoDB + Cron)
├── src/
│   ├── config/                     # Environment validation & MongoDB connection
│   │   ├── env.js
│   │   └── db.js
│   │
│   ├── models/                     # [M] Data Schemas & Persistence Constraints
│   │   ├── User.js                 # Authentication, role, settings, profile
│   │   ├── Note.js                 # Notebooks, cells, version vector, collaborators
│   │   ├── TrashedCell.js          # Cell-level recycle bin
│   │   ├── Feedback.js             # User suggestions & bug reports
│   │   ├── SystemLog.js            # System maintenance & audit logs (with 30-day TTL)
│   │   └── SystemConfig.js         # Dynamic runtime feature flags
│   │
│   ├── views/                      # [V] Presenters & DTO Transformers
│   │   ├── response.view.js        # Standardized { success, data, error, meta } envelopes
│   │   ├── note.view.js            # Serializer for browser Dexie IndexedDB hydration
│   │   └── user.view.js            # Data sanitizer (strips passwords & reset tokens)
│   │
│   ├── controllers/                # [C] Thin HTTP Adapters (Req -> Service -> View)
│   │   ├── auth.controller.js      # Register, login, forgot/reset password, profile
│   │   ├── note.controller.js      # Notebook CRUD, rename, star, trash, move cell
│   │   ├── cell.controller.js      # Granular cell-level trash & restore
│   │   ├── folder.controller.js    # Recursive folder rename & folder deletion
│   │   ├── sync.controller.js      # Local-first hydration & Atlas backup push
│   │   ├── share.controller.js     # Team notebook invitations & collaboration
│   │   ├── execute.controller.js   # Polyglot code execution endpoint
│   │   ├── admin.controller.js     # Telemetry dashboard, users, logs
│   │   └── health.controller.js    # Ping, health stats, user feedback
│   │
│   ├── services/                   # [S] Core Business Logic (Decoupled from HTTP)
│   │   ├── auth.service.js         # Hashing, JWT creation, token rotation
│   │   ├── note.service.js         # Note storage, access checks, cell moves
│   │   ├── cell.service.js         # Cell-level recycling and restoration
│   │   ├── folder.service.js       # Recursive path replacement
│   │   ├── sync.service.js         # Anti-wipeout guard, recency guard, versioning
│   │   ├── share.service.js        # Invitation validation & access assignment
│   │   ├── execution.service.js    # Process sandboxing (JS, TS, Python, C, C++, Java)
│   │   ├── admin.service.js        # User bans, audit logging, system metrics
│   │   ├── mail.service.js         # HTML email templates & Nodemailer dispatch
│   │   └── cron.service.js         # 15-day auto trash purge, token cleanup, heartbeat
│   │
│   ├── middlewares/                # Request Validation & Security Guards
│   │   ├── auth.middleware.js      # Bearer JWT validator + non-blocking activity logger
│   │   ├── role.middleware.js      # RBAC (admin guard)
│   │   ├── rateLimit.middleware.js # Auth and execution rate limiters
│   │   └── error.middleware.js     # Centralized global error handler
│   │
│   ├── websocket/                  # Real-Time Gateway
│   │   └── terminal.ws.js          # Interactive terminal runner (stdin/stdout streaming)
│   │
│   └── routes/                     # Express Router Mounts
│       ├── index.js                # Aggregator (/api/*)
│       ├── auth.routes.js
│       ├── note.routes.js
│       ├── cell.routes.js
│       ├── folder.routes.js
│       ├── sync.routes.js
│       ├── share.routes.js
│       ├── execute.routes.js
│       ├── admin.routes.js
│       └── health.routes.js
│
└── tests/                          # Automated Test Suite (100% Pass)
    ├── sync.service.test.js        # Anti-Wipeout Guard & Recency Guard tests
    ├── execution.service.test.js   # Code execution tests
    ├── api.test.js                 # Integration tests for routes & responses
    └── run_all.js                  # Master test runner
```

---

## 🛡️ Local Browser First + Atlas Cloud Backup Strategy

The sync engine (`src/services/sync.service.js`) guarantees:
1. **Hydration (`GET /api/sync/hydrate`):** Delivers the user's complete dataset to browser **Dexie.js (IndexedDB)** on login, making the client 100% usable offline.
2. **Push Backup (`POST /api/sync/push`):** Browser sends debounced batched edits to Atlas.
3. **Anti-Wipeout Guard:** If an empty client stub attempts to overwrite a note that has real cells in Atlas, the update is blocked and flagged as a conflict.
4. **Recency Guard:** If an offline device wakes up with stale notes (`(serverTs - clientTs) > 30000ms`), older updates cannot overwrite newer cloud changes.
5. **Monotonic `_version` Vector:** Increments on every save to ensure deterministic multi-device convergence.

---

## 📡 API Endpoints Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Public | Register new user account |
| `POST` | `/login` | Public | Authenticate with email & password |
| `POST` | `/forgot-password`| Public | Send 1-hour password reset link via email |
| `POST` | `/reset-password` | Public | Reset password using secret token |
| `GET`  | `/me` | User | Get authenticated user profile |
| `PUT`  | `/settings` | User | Update editor preferences (default language, theme) |

### 📓 Notebooks & Cells (`/api/notebooks`, `/api/cells`, `/api/folders`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET`    | `/api/notebooks` | User | List all active notebooks (owned + shared) |
| `GET`    | `/api/notebooks/:id` | User | Get complete notebook by ID |
| `POST`   | `/api/notebooks` | User | Create or update notebook |
| `PUT`    | `/api/notebooks/:id/rename` | User | Rename notebook |
| `PUT`    | `/api/notebooks/:id/star` | User | Toggle starred state |
| `DELETE` | `/api/notebooks/:id` | User | Move notebook to trash |
| `POST`   | `/api/notebooks/move-cell` | User | Move cell between two notebooks |
| `POST`   | `/api/cells/trash` | User | Trash individual cell |
| `POST`   | `/api/trash/restore-cell/:id`| User | Restore trashed cell to notebook |
| `DELETE` | `/api/trash/cell/:id` | User | Permanently delete cell |
| `GET`    | `/api/folders` | User | List distinct folder categories |
| `PUT`    | `/api/folders/rename` | User | Recursively rename folder and subfolders |
| `DELETE` | `/api/folders/:name` | User | Move entire folder to trash |

### 🔄 Offline Sync & Atlas Backup (`/api/sync`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET`  | `/hydrate` | User | Full dataset hydration for client IndexedDB |
| `GET`  | `/manifest` | User | Lightweight note ID + version manifest |
| `POST` | `/pull` | User | Fetch full content for specific note IDs |
| `POST` | `/push` | User | Push batch edits to MongoDB Atlas |
| `GET`  | `/status` | User | Diagnostics & note counts |

### 🤝 Collaboration (`/api/share`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/invite` | User | Invite user by email |
| `GET`  | `/invites` | User | View pending notebook invitations |
| `GET`  | `/my-shared`| User | List notebooks shared by current user |
| `POST` | `/respond` | User | Accept or decline invitation |

### ⚡ Code Execution & Terminal (`/api/execute`, `/ws/terminal`)
| Method | Protocol | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/execute` | User | Run code snippet (JS, TS, Python, C, C++, Java) |
| `GET`  | `/api/execute/languages` | User | List supported languages and runners |
| `WS`   | `/ws/terminal` | WS | Real-time interactive terminal with live STDIN/STDOUT |

### 👑 Administration (`/api/admin`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET`    | `/dashboard` | Admin | System telemetry, active users, memory usage |
| `GET`    | `/users` | Admin | Paginated user management |
| `POST`   | `/users/:id/toggle-block` | Admin | Block or unblock user account |
| `DELETE` | `/users/:id` | Admin | Permanently delete user and their data |
| `GET`    | `/system-logs` | Admin | Audit & maintenance logs |
| `POST`   | `/system-logs/clear` | Admin | Clear audit logs |
| `GET`    | `/feedback` | Admin | View user feedbacks |
| `PUT`    | `/feedback/:id/read` | Admin | Mark feedback as reviewed |

---

## 🧪 Testing & Validation

Run the automated test suite:
```bash
npm test
```
Outputs:
- **Sync Service Unit Tests:** Validates Anti-Wipeout & Recency conflict resolution.
- **Execution Service Unit Tests:** Validates code compilation and sandboxing.
- **API Integration Tests:** Validates Express app routes, HTTP status codes, and error formatting.
