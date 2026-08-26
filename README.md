# AME Tracker

End-to-end fabrication tracking for ductwork: import or sync jobs from Trimble FabShop, print/scan QR stickers, load trucks, and generate gauge / gate-pass reports.

```text
AME-Tracker/
├── ame-tracker-backend/       NestJS API + Prisma (SQLite or PostgreSQL)
├── AME-tracker-web-portal/    React + Vite admin portal
├── ame-tracker-mobile/        Expo React Native operator app
├── demo/                      Sample VJOB + Fab Shop files for manual import
├── .gitignore
└── README.md                  ← you are here
```

> **Note:** Keep the portal folder name as `AME-tracker-web-portal` (or rename locally when nothing is locking it). Commands below use that path.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Data model](#data-model)
4. [Complete product flow](#complete-product-flow)
5. [Two ways to load jobs](#two-ways-to-load-jobs)
6. [Key identifiers (Piece vs IDItem vs ItemTracking)](#key-identifiers-piece-vs-iditem-vs-itemtracking)
7. [Quick start](#quick-start)
8. [Environment variables](#environment-variables)
9. [Apps in detail](#apps-in-detail)
10. [API map](#api-map)
11. [Reports](#reports)
12. [Demo files](#demo-files)
13. [GitHub checklist](#github-checklist)

---

## What it does

| Area | Capability |
|------|------------|
| **Ingest** | Sync jobs from Trimble FabShop SQL Server **or** manually upload `.t4vjob` + Fab Shop QR `.xlsx` + Job Report `.xlsx` |
| **Catalog** | Store pieces with metal, gauge, weight, fitting flag (gauge-report grain) |
| **Units / QR** | One physical unit per QR sticker (`ItemUnit`) |
| **Dispatch** | Mobile operators scan QR onto a transit, capture truck photo, complete load |
| **Live ops** | Portal dashboard with Socket.IO scan events |
| **Reports** | Gauge (dispatch summary by metal), gate pass PDF, QR label PDF, dispatch CSV |

---

## Architecture

```text
┌─────────────────────┐     ┌──────────────────────┐
│  Web Portal         │     │  Mobile (Expo)       │
│  React + Vite       │     │  QR scan + photo     │
│  :5173              │     │  Expo / LAN          │
└─────────┬───────────┘     └──────────┬───────────┘
          │ REST + Socket.IO           │ REST
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────────┐
          │  ame-tracker-backend       │
          │  NestJS  :3000             │
          │  JWT (ADMIN / OPERATOR)    │
          └───────┬───────────┬────────┘
                  │           │ read-only (optional)
                  ▼           ▼
         ┌────────────┐  ┌─────────────────────┐
         │ Prisma DB  │  │ Trimble FabShop     │
         │ SQLite or  │  │ SQL Server :1433    │
         │ PostgreSQL │  │ Projects→Jobs→Items │
         └────────────┘  └─────────────────────┘
```

**Default local DB:** SQLite (`DATABASE_URL=file:./dev.db`).  
**Optional live source:** Trimble FabShop via `mssql` (read-only).

---

## Data model

Hierarchy stored locally:

```text
Project
  └── Job                         (sourceJobId = Trimble IDJob, e.g. 70037)
        └── Item                  (catalog / piece definition — gauge report)
              └── ItemUnit        (one QR sticker / physical unit — scanning)
```

| Entity | Trimble source | Local purpose |
|--------|----------------|---------------|
| **Project** | `Projects.ProjectName` | Grouping, reports |
| **Job** | `Jobs.IDJob` + `JobName` | Work order |
| **Item** | `Items` (+ metal, weight, qty, fitting) | Gauge aggregates |
| **ItemUnit** | `ItemTracking` + `QtyItemGuids` | Scan / dispatch / QR PDF |
| **Dispatch** | (AME only) | Truck load session |
| **ImportBatch** | Sync URI or uploaded files | Audit of ingest |

**Important:** Piece number ≠ IDItem ≠ ItemTracking. See [identifiers](#key-identifiers-piece-vs-iditem-vs-itemtracking).

---

## Complete product flow

```text
1. LOAD JOB
   ├─ A) Dashboard → Sync from FabShop DB  (live SQL, per job)
   └─ B) Import page → upload files         (manual, multi-job)

2. LOCAL DATA READY
   Project → Job → Item (catalog) → ItemUnit (QR + tracking)

3. OPTIONAL
   Reports → QR PDF for stickers

4. LOAD TRUCK (mobile)
   Login (OPERATOR)
   → New transit / open dispatch
   → Scan QR codes (units → SHIPPED / LOADED)
   → Capture vehicle photo
   → Complete transit

5. LIVE OPS (portal)
   Dashboard / Reports update via REST + Socket.IO

6. REPORTS
   Gauge report (by project / job / metal)
   Gate pass PDF
   Dispatch CSV
```

### Status lifecycle (units)

```text
PENDING  →  (scanned onto dispatch)  →  SHIPPED / LOADED
```

Each QR / unit can only be loaded **once** (enforced in DB + API).

---

## Two ways to load jobs

Keep these **separate** on purpose.

### A) Trimble sync (Dashboard)

- Portal: **Sync from FabShop DB**
- Backend: `GET /api/fabshop/syncable-jobs`, `POST /api/fabshop/sync/:idJob`
- Pulls `Projects`, `Jobs`, `Items`, `ItemTracking`, `QtyItemGuids`
- Creates `ImportBatch` with `t4vjobFilename = fabshop-sync://IDJob=…`
- Best when SQL Server is reachable

### B) Manual upload (Import page)

- Portal: **Import** only (no sync UI here)
- Three file types (multi-select per type):

| Slot | File | Grain | Purpose |
|------|------|-------|---------|
| Vulcan job | `.t4vjob` | Per unit | Project/Job header + `ItemTracking`, `PieceNbr`, status |
| Fab Shop QR | `.xlsx` | Per sticker | `job id`, **piece number**, QR GUID, `GuidInUse` |
| Job report | `.xlsx` | Per piece def | Fitting, metal, qty, dimensions, weight (gauge) |

Files sharing a job code in the name (e.g. `P47184`) are grouped into one import job.

**Recommended join keys for manual files:**

| Link | Keys |
|------|------|
| Job report ↔ `.t4vjob` | **Job ID** + **Piece number** |
| Fab Shop ↔ `.t4vjob` | **Job ID** + ideally **ItemTracking** (add column) + piece number |
| Fab Shop col 3 today | **Piece number** (not IDItem), even if header says `IDitem/piece no` |

Add to job report if missing: **Job ID**, **Project Name**, **Job Name** (and optional **IsFitting**).  
Add to Fab Shop if possible: **ItemTracking**, and ensure **Job ID** = Trimble `IDJob` (e.g. `70037`).

---

## Key identifiers (Piece vs IDItem vs ItemTracking)

| Field | Example | Meaning |
|-------|---------|---------|
| **Piece number** (`PieceNbr` / `#`) | `1`, `1-` | Shop / catalog piece label |
| **IDItem** | `150` | Trimble catalog item id (**not** the same as piece number) |
| **ItemTracking** (`IDItemTracking`) | `4592865` | One physical unit row |
| **QR / ItemQtyGuid** | UUID | Sticker scanned by mobile |

Never treat piece number as IDItem.

---

## Quick start

### Prerequisites

- Node.js 20+ (22 OK)
- npm
- (Optional) SQL Server with Trimble FabShop for live sync
- (Optional) Expo Go / Android emulator for mobile

### 1. Backend

```bash
cd ame-tracker-backend
cp .env.example .env
npm install
npx prisma generate
npm run db:setup          # prisma db push + seed
npm run start:dev         # http://localhost:3000
```

### 2. Web portal

```bash
cd AME-tracker-web-portal
npm install
npm run dev               # http://localhost:5173
```

Portal expects API at `http://localhost:3000/api` (override with `VITE_API_URL` if you add one).

### 3. Mobile

```bash
cd ame-tracker-mobile
cp .env.example .env      # set EXPO_PUBLIC_API_URL to your LAN IP for a real device
npm install
npm run start
```

### Seed logins

| Email | Password | Role |
|-------|----------|------|
| `admin@ametracker.local` | `Password123!` | ADMIN |
| `operator@ametracker.local` | `Password123!` | OPERATOR |
| `admin@ame.local` | `Admin@123` | ADMIN |

---

## Environment variables

### Backend (`ame-tracker-backend/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma DB (`file:./dev.db` or Postgres URL) |
| `JWT_SECRET` | Access/refresh signing |
| `PORT` | Default `3000` |
| `CORS_ORIGINS` | Portal + Expo origins |
| `STORAGE_LOCAL_PATH` | Uploads root (`./uploads`) |
| `FABSHOP_DB_*` | Optional Trimble SQL Server (read-only) |

See `.env.example`. **Never commit `.env`.**

### Mobile (`ame-tracker-mobile/.env`)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | API base, e.g. `http://192.168.1.10:3000` |

---

## Apps in detail

### Backend — `ame-tracker-backend/`

```text
src/
├── auth/           JWT login, refresh, logout, me
├── users/          User admin
├── projects/ jobs/ products/
├── imports/        Manual file ingest + parsers/
├── fabshop-db/     Trimble SQL client + sync service
├── transits/       Dispatch create / scan / photo / complete
├── dashboard/      KPIs + Socket.IO gateway
├── reports/        Gauge, gate pass, QR PDF, CSV
├── storage/        Local uploads
├── audit/          Action log
└── prisma/         PrismaService
prisma/
├── schema.prisma
└── seed.ts
```

Useful scripts:

```bash
npm run start:dev
npm run db:setup
npm run db:reset
npm run prisma:studio
```

### Portal — `AME-tracker-web-portal/`

```text
src/
├── pages/          Dashboard, Import, Projects, ManualTrack,
│                   Dispatch, Reports, Settings, Login
├── services/       api.ts, socket.ts
├── components/     layout, PartDrawer, …
└── store/          AppContext
```

| Page | Role |
|------|------|
| Dashboard | Live KPIs, jobs, **FabShop sync** |
| Import | Manual multi-file upload only |
| Projects | Browse projects / jobs / parts |
| Manual Track | Search + portal ship |
| Dispatch | Transits list / detail |
| Reports | Dispatch table, gauge, gate pass |

### Mobile — `ame-tracker-mobile/`

```text
Login → Home (new transit) → Transit screen
  → Scan QR → Vehicle photo → Complete
```

Operator role; talks to `/api/auth` and `/api/transits`.

---

## API map

Base: `http://localhost:3000/api`

| Area | Examples |
|------|----------|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` |
| FabShop | `GET /fabshop/status`, `/fabshop/syncable-jobs`, `POST /fabshop/sync/:idJob` |
| Imports | `GET /imports?source=upload`, `POST /imports`, `POST /imports/:id/execute` |
| Products | `GET /products`, status updates |
| Transits | `POST /transits`, scan, photo, complete |
| Dashboard | `GET /dashboard`, Socket.IO room `dashboard` |
| Reports | gauge preview/xlsx, gate-pass pdf, job QR pdf |

---

## Reports

| Report | Source fields | Output |
|--------|---------------|--------|
| **Gauge** | Project, Job, Metal, gauge, IsFitting, MetricWeight, shipped units | Excel dispatch summary |
| **Gate pass** | Shipped units on a date / transit | PDF |
| **QR labels** | Job units + QR | PDF stickers |
| **Dispatch CSV** | Portal Reports table | CSV |

Gauge math uses **Item** catalog weights; unit count comes from shipped **ItemUnit** rows.

---

## Demo files

`demo/` contains a ready pair for manual import practice:

| File | Use |
|------|-----|
| `P47184.t4vjob` | VJOB |
| `fab-shop-p47184.xlsx` | QR rows for that job |
| `scan-codes.txt` | Sample QR UUIDs |

See `demo/README.md`.

---

## GitHub checklist

Before first push:

1. Confirm **no** `.env`, `*.db`, `uploads/`, or `node_modules/` are staged (root `.gitignore` covers them).
2. From repo root:

```bash
git init
git add .
git status    # review carefully
git commit -m "Initial commit: AME Tracker monorepo"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

3. Optional local rename (close Vite/IDE locks first):

```bash
# Windows — two-step rename if needed
Rename-Item AME-tracker-web-portal ame-tracker-web-portal
```

Then update paths in this README if you rename.

---

## License

UNLICENSED / private — adjust before making the repository public.
