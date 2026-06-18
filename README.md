# GitLab Group Transfer Tool

A lightweight web-based GUI for migrating all projects within a GitLab group to another GitLab instance — with full support for subgroups, Git LFS objects, archived projects, and offline bundle import/export.

![Python](https://img.shields.io/badge/Python-3.11%2B-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Features

| Feature | Description |
|---|---|
| **Batch Transfer** | Migrate all projects in a source group, preserving subgroup hierarchy |
| **LFS Support** | Transfers Git LFS objects via `git lfs fetch/push` |
| **Archived Projects** | Includes archived projects and syncs archived status to target |
| **Compare Mode** | Side-by-side diff of source vs target — shows missing, empty, incomplete, or un-archived projects |
| **Re-transfer** | One-click re-transfer of individual projects from the compare table |
| **Export (Bundle)** | `git clone --mirror` → `git bundle create` — produces a portable `.bundle` file with LFS |
| **Import (Bundle)** | `git bundle` → `git push` — no file-size limit, no server callback required |
| **Import (GitLab .tar.gz)** | Extracts `project.bundle` from inside GitLab's export archive and imports via git push |
| **413 Handling** | Automatically falls back to `remote_import` when nginx rejects uploads >2 GB |
| **Real-time Log** | SSE-based live progress streaming in the browser |
| **Config Persistence** | Saves target URL, group, and credentials to `config.json` (source URL intentionally excluded) |

---

## Architecture

```
gitlab direct transfer/
├── main.py                    # Entry point — starts Flask and opens the browser
├── requirements.txt           # pip dependencies
├── install_deps.bat           # One-click dependency installer (Windows)
├── run.bat                    # Double-click launcher (Windows)
├── public/                    # Frontend (static files served at /)
│   ├── index.html             # Single-page UI
│   ├── css/style.css          # Styles
│   └── js/app.js              # Frontend logic (SSE, fetch, compare table)
└── server/                    # Backend (Python)
    ├── app.py                 # Flask routes — serves public/ as static root
    ├── transfer_engine.py     # Per-project transfer orchestration (7-step pipeline)
    ├── gitlab_client.py       # python-gitlab API wrapper
    ├── git_ops.py             # git subprocess helpers (clone, push, bundle, LFS)
    ├── utils.py               # Temp dir management, credential stripping, timer
    └── config.py              # config.json read/write (saved to project root)
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Python 3.11+** | Must be the full installer from python.org (not the Microsoft Store version — no `tkinter`) |
| **Git** | Must be on PATH (`git --version`) |
| **Git LFS** | Optional. Required only if source projects use LFS (`git lfs install`) |

---

## Quick Start (Windows)

```bat
:: 1. Install Python dependencies
install_deps.bat

:: 2. Launch the tool (opens browser automatically)
run.bat
```

The tool starts a local Flask server on `http://127.0.0.1:5000` and opens the browser.

---

## Usage

### Transfer

1. Fill in **Source** credentials (URL, Group Path, Username, PAT)
2. Fill in **Target** credentials
3. Click **驗證連線 Validate** to test both connections
4. *(Optional)* Enable **試運行 Dry Run** to preview without writing
5. Click **開始轉移 Start Transfer**

### Compare & Selective Re-transfer

1. Click **比對兩邊差異 Compare**
2. The table shows each project's status:
   - **✘ 目標缺少** — project missing on target → click **轉移**
   - **⚠ 內容未推送** — project exists but is empty → click **轉移**
   - **⚠ 分支不完整** — some branches missing (Deep Compare mode) → click **轉移**
   - **⚠ 待封存** — project transferred but not yet archived → click **封存**
   - **✔ 已同步** — fully in sync

Enable **全面比對（分支）** for branch-level diffing (slower, uses parallel API calls).

### Export / Import

Expand the **匯入 / 匯出** panel:

**Export** — clones a project (or whole group) and saves a `.bundle` file locally.  
**Import** — imports a `.bundle` or GitLab `.tar.gz` export file into the target instance.

> `.tar.gz` import automatically extracts the embedded `project.bundle` and LFS objects,
> then uses `git push` — no nginx size limit, no server-to-client network requirement.

---

## Transfer Pipeline (per project)

```
Step 1  Check if project already exists on target
Step 2  Create namespace / subgroup on target (if needed)
Step 3  Create project on target (delete + recreate if re-transferring)
Step 3.5 Remove branch protections (prevents pre-receive hook rejection)
Step 4  git clone --mirror <source>
Step 4.5 git lfs fetch --all + git lfs push --all (if LFS detected)
Step 5  git push --mirror <target>
Step 6  Sync settings (description, visibility, default branch, archived status)
Step 7  Clean up temp directory
```

---

## Security Notes

- PAT tokens are **never written to disk** during git operations
- Credentials are embedded in URLs **in memory only** (`https://user:token@host/path.git`)
- All error messages are filtered through `strip_credentials()` before display
- Source GitLab URL and group path are **intentionally not persisted** in `config.json`

---

## Configuration

`config.json` is auto-created on first launch:

```json
{
  "src_username": "",
  "src_pat": "",
  "tgt_url": "http://...",
  "tgt_group": "my-group",
  "tgt_username": "",
  "tgt_pat": "",
  "exp_out_dir": ""
}
```

---

## Dependencies

```
flask>=3.0
python-gitlab>=4.0
requests>=2.28
urllib3>=1.26
```

Install via `install_deps.bat` or:

```bash
pip install flask python-gitlab requests urllib3
```

---

## Known Limitations

- Windows-only file picker (uses PowerShell `System.Windows.Forms`)
- `git push --mirror` skips GitLab internal refs (`refs/keep-around/*`) — this is intentional
- Projects with protected push rules on the target may still reject pushes; disable them in GitLab Admin → Push Rules

---

## License

MIT
