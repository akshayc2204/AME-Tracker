# AME Tracker Web Portal

React + Vite admin UI for operations, import, dispatch, and reports.

## Stack

- React 19 + TypeScript
- Vite
- React Router
- Socket.IO client (live scans)
- Lucide icons

## Folder layout

```text
AME-tracker-web-portal/
├── public/
├── src/
│   ├── pages/           # Dashboard, Import, Projects, ManualTrack,
│   │                    # Dispatch, Reports, Settings, Login
│   ├── components/
│   ├── services/        # api.ts, socket.ts
│   ├── store/
│   └── styles/
├── index.html
└── package.json
```

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Backend must be on `http://localhost:3000`.

Optional env (if you add Vite env support):

```bash
VITE_API_URL=http://localhost:3000/api
```

Login with an ADMIN seed user (see root README).

## Flows in the UI

| Page | Flow |
|------|------|
| **Dashboard** | Live KPIs + **Sync from FabShop DB** (Trimble only) |
| **Import** | Manual upload only — `.t4vjob`, Fab Shop QR `.xlsx`, Job Report `.xlsx` (multi-file) |
| **Projects** | Browse synced/imported jobs and parts |
| **Manual Track** | Search unit / mark shipped from portal |
| **Dispatch** | View transits created by mobile |
| **Reports** | Dispatch log, gauge Excel, shipping list PDF |

Sync and upload are intentionally separate: sync on Dashboard, files on Import.
