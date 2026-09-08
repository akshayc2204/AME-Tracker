# AME Tracker Sync Agent

Desktop app that watches a **local folder on your PC** and uploads complete `.t4vjob` + `.xlsx` (Item Schedule) pairs to the AME Tracker API.

Use this when job files live on your machine and the NestJS server runs elsewhere. You do **not** set that local path in the web portal.

## How it works

1. Install and open the agent on the PC that has the drop folder.
2. Enter the backend **API URL** (e.g. `http://server:3000` or your HTTPS URL).
3. Log in with an **ADMIN** account.
4. Choose the local DataUploads folder (native folder picker).
5. The agent scans on an interval (default 2 minutes) and on **Sync now**.
6. Complete pairs are uploaded to `POST /api/imports/upload`.
7. Jobs appear in the web portal / mobile apps as usual.

Incomplete pairs (only one of the two files) stay listed as waiting until both files share the same basename.

## Requirements

- Windows (primary target; Electron can run elsewhere for development)
- Node.js 20+ to build/run from source
- Reachable AME Tracker backend with the upload endpoint
- ADMIN user credentials

## Develop

```bash
cd ame-tracker-sync-agent
npm install
npm start
```

## Package (Windows installer)

```bash
npm run dist
```

Output lands in `dist/`.

## Settings stored locally

On the agent PC (via `electron-store`):

- API URL
- Folder path
- Sync interval
- Access / refresh tokens
- Content hashes of already-uploaded pairs (to skip re-uploads)

## Sync engine behavior

1. List `.t4vjob` / `.xlsx` / `.xls` (ignore `~$` and `.` files; one-level subfolders)
2. Group by basename without extension
3. Incomplete pairs → show waiting, do not upload
4. Hash both files; if this agent already synced that hash → skip
5. Peek Job ID from `.t4vjob`, then call `POST /api/imports/check`
6. If the server says the job/hash is already in the database → **skip upload** (no file transfer)
7. Otherwise upload via `POST /api/imports/upload`
8. Persist result hashes locally for faster next runs

## Pair rules (same as server folder sync)

- Files: `.t4vjob` + `.xlsx` (or `.xls`)
- Same basename, e.g. `JOB123.t4vjob` + `JOB123.xlsx`
- Ignores `~$` Excel temp files and dotfiles
- Scans the folder and one level of subfolders

## Portal vs agent

| Where files live | What to use |
|------------------|-------------|
| Shared folder mounted on the **server** | Admin → Server job folder sync (path on server) |
| Folder on **your PC** | This Sync Agent (path chosen in the agent only) |
