# GitLab Transfer Tool — Server Deployment Guide

This guide covers the **server-only deployment package**: a self-contained executable plus a static frontend folder.

---

## Deployment Package

This directory is the complete deployment package:

```
/
├── GitLab-Transfer-Server.exe   ← server executable
├── run_server.bat               ← double-click to start
├── public/                      ← frontend static files
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── README.md
```

`config.json` is auto-created next to the `.exe` on first launch.

---

## Start Server

**Quickstart — double-click `run_server.bat`.**  
It starts the server and opens `http://localhost:5000` in the browser automatically.

To start manually or with custom options:

```bat
:: Default (localhost:5000)
GitLab-Transfer-Server.exe

:: Custom port
GitLab-Transfer-Server.exe --port 8080

:: Allow LAN access
GitLab-Transfer-Server.exe --host 0.0.0.0 --port 5000
```

```
Options:
  --host   Bind address  (default: 127.0.0.1)
  --port   Port          (default: 5000)
```

---


## API Reference

Base URL: `http://localhost:5000`

All `POST` endpoints accept and return `application/json`.  
Progress is streamed via **Server-Sent Events (SSE)** on `GET /stream`.

---

### Static / UI

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves `public/index.html` |
| `GET` | `/css/style.css` | Stylesheet |
| `GET` | `/js/app.js` | Frontend logic |

---

### SSE Stream

```
GET /stream
```

Streams real-time progress events as `text/event-stream`.  
Connect before calling `/start`, `/validate`, `/export_project`, `/import_project`, or `/clear`.

**Event types:**

| `type` | Fields | Description |
|--------|--------|-------------|
| `log` | `level`, `text` | Log line (`INFO` / `OK` / `WARN` / `ERROR`) |
| `overall` | `done`, `total` | Overall progress counter |
| `step` | `step`, `total`, `desc` | Current pipeline step (1–7) |
| `project` | `name`, `status`, `detail` | Per-project status update |
| `done` | `errors[]` | Transfer complete; errors list |
| `validate_done` | — | Validation complete |

**Example (JavaScript):**
```js
const es = new EventSource('/stream');
es.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'log') console.log(msg.level, msg.text);
  if (msg.type === 'done') es.close();
};
```

---

### Validate Connections

```
POST /validate
```

**Request:**
```json
{
  "src": { "url": "https://gitlab.example.com", "group": "my-group",
           "username": "alice", "token": "glpat-xxxx" },
  "tgt": { "url": "http://10.0.0.1:30000", "group": "target-group",
           "username": "bob",   "token": "glpat-yyyy" }
}
```

Progress is emitted on `/stream`. Returns `200` immediately; result arrives as `validate_done` event.

---

### Start Group Transfer

```
POST /start
```

**Request:** same shape as `/validate`, plus `options`:
```json
{
  "src": { ... },
  "tgt": { ... },
  "options": {
    "skip_existing":  true,
    "mirror_tags":    true,
    "copy_settings":  true,
    "dry_run":        false
  }
}
```

Transfers all projects in `src.group` to `tgt.group`, preserving subgroup hierarchy.  
Progress streamed via `/stream`. Returns `200` immediately.

---

### Stop Transfer

```
POST /stop
```

No body. Signals the running transfer to stop after the current project completes.

---

### Compare Source vs Target

```
POST /compare
```

**Request:**
```json
{
  "src":  { "url": "...", "group": "...", "username": "...", "token": "..." },
  "tgt":  { "url": "...", "group": "...", "username": "...", "token": "..." },
  "deep": false
}
```

Set `deep: true` to perform branch-level comparison (slower, uses parallel API calls).

**Response:**
```json
{
  "projects": [
    {
      "src_path":    "my-group/sub/project",
      "rel_path":    "sub/project",
      "tgt_path":    "target-group/sub/project",
      "in_target":   true,
      "status":      "ok",
      "src_archived": false,
      "tgt_archived": false
    }
  ],
  "src_total": 42,
  "tgt_total": 40,
  "missing":    2
}
```

**`status` values:**

| Value | Meaning |
|-------|---------|
| `missing` | Project absent on target |
| `empty` | Target project exists but has no commits |
| `incomplete` | Some source branches/tags missing on target (deep mode) |
| `archive_needed` | Project transferred but source is archived, target is not |
| `ok` | Fully in sync |

---

### Transfer Single Project

```
POST /transfer_one
```

**Request:**
```json
{
  "src": { ... },
  "tgt": { ... },
  "options": { "skip_existing": false, ... },
  "project_src_path": "my-group/sub/project"
}
```

Transfers one project. Always pass `skip_existing: false` when re-transferring from the compare table.  
Progress streamed via `/stream`.

---

### Archive Single Project

```
POST /archive_one
```

**Request:**
```json
{
  "tgt": { "url": "...", "group": "...", "username": "...", "token": "..." },
  "tgt_path": "target-group/sub/project"
}
```

**Response:**
```json
{ "ok": true }
```

Archives the specified project on the target GitLab instance.

---

### Config

```
GET  /api/config          → saved settings (JSON)
POST /api/config          → save settings
```

**Saved fields:**
```json
{
  "src_username": "",
  "src_pat":      "",
  "tgt_url":      "http://...",
  "tgt_group":    "my-group",
  "tgt_username": "",
  "tgt_pat":      "",
  "exp_out_dir":  ""
}
```

> Source URL and source group are **intentionally not persisted** (security).

---

### Clear Target Projects

```
POST /clear
```

**Request:**
```json
{
  "tgt": { "url": "...", "group": "...", "username": "...", "token": "..." }
}
```

**⚠ Destructive.** Permanently deletes all projects in `tgt.group`. Requires double confirmation in the UI. Progress streamed via `/stream`.

---

### Browse (File Picker — Windows only)

```
GET /browse?mode=file
GET /browse?mode=dir
```

Opens a native Windows file/folder picker dialog.  
Used by the frontend "選檔" button in the Import panel.

**Response:**
```json
{ "path": "C:\\gitlab-exports\\project.bundle" }
```

Returns `path: ""` if the user cancels.

---

### Export Projects

```
POST /export_project
```

**Request:**
```json
{
  "src": { "url": "...", "group": "...", "username": "...", "token": "..." },
  "src_path": "my-group/project",
  "out_dir":  "C:\\gitlab-exports"
}
```

Leave `src_path` empty to export the entire group.  
Clones each project (`git clone --mirror`) and creates a `.bundle` file per project (with LFS objects in a sibling `.lfs/` folder).  
Progress streamed via `/stream`.

---

### Import Projects

```
POST /import_project
```

**Request:**
```json
{
  "tgt": { "url": "...", "group": "...", "username": "...", "token": "..." },
  "namespace": "target-group",
  "file_path": "C:\\gitlab-exports"
}
```

`file_path` can be:
- A **directory** — imports all `.bundle` and `.tar.gz` files inside
- A single **`.bundle`** file — git push mode (no size limit)
- A single **`.tar.gz`** file (GitLab export) — extracts `project.bundle` internally and uses git push

**Import modes:**

| File type | Method | Notes |
|-----------|--------|-------|
| `.bundle` | `git clone --mirror` → `git push` | No size limit, LFS from `.lfs/` sibling folder |
| `.tar.gz` | Extract `project.bundle` internally → `git push` | No nginx size limit, no server callback needed |
| `.tar.gz` (no bundle inside) | GitLab API `import` | Fallback; may fail on files >2 GB |

Progress streamed via `/stream`.

---

## Frontend ↔ Server Flow

```
Browser (public/index.html)
  │
  ├─ GET  /                  → index.html
  ├─ GET  /css/style.css
  ├─ GET  /js/app.js
  │
  ├─ GET  /stream            ← open SSE connection first
  ├─ POST /validate          → triggers validate_done event
  ├─ POST /start             → triggers log / overall / step / project / done events
  ├─ POST /stop
  │
  ├─ POST /compare           → returns JSON (no SSE)
  ├─ POST /transfer_one      → triggers SSE events
  ├─ POST /archive_one       → returns JSON
  │
  ├─ GET  /api/config
  ├─ POST /api/config
  │
  ├─ GET  /browse?mode=file
  ├─ POST /export_project    → triggers SSE events
  └─ POST /import_project    → triggers SSE events
```

All API calls in `public/js/app.js` use **relative paths** (e.g., `fetch('/compare', ...)`), so the frontend must be served from the same origin as the server (i.e., via `http://localhost:5000`), not opened directly as a local file.


---

## Frontend UI

```
<img width="539" height="430" alt="image" src="https://github.com/user-attachments/assets/92bae6cb-bfe5-45b2-8fc8-67ef21ec34da" />

<img width="482" height="427" alt="image" src="https://github.com/user-attachments/assets/abec5648-ceb3-45fa-b9df-99d64a7d3da2" />


