# AME Tracker Backend

NestJS API for AME Tracker: auth, Trimble FabShop sync, file import, products, dispatches, live dashboard, and reports.

## Stack

- NestJS + TypeScript
- Prisma (SQLite by default; PostgreSQL-ready)
- JWT roles: `ADMIN`, `OPERATOR`
- Optional read-only Trimble FabShop (SQL Server via `mssql`)
- Socket.IO dashboard events
- Local uploads for imports & truck photos

## Folder layout

```text
ame-tracker-backend/
├── prisma/
│   ├── schema.prisma      # Project → Job → Item → ItemUnit
│   └── seed.ts
├── scripts/               # One-off / dry-run utilities
├── src/
│   ├── auth/
│   ├── fabshop-db/        # SQL client + sync
│   ├── imports/           # Upload + parsers (.t4vjob, fabshop, job-report)
│   ├── transits/          # Dispatch / scan
│   ├── dashboard/
│   ├── reports/
│   └── …
├── .env.example
└── package.json
```

## Quick start

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:setup
npm run start:dev
```

API: `http://localhost:3000`  
Health-style routes live under `/api/…`.

### Seed users

| Email | Password | Role |
|-------|----------|------|
| admin@ametracker.local | Password123! | ADMIN |
| operator@ametracker.local | Password123! | OPERATOR |
| admin@ame.local | Admin@123 | ADMIN |

## Data flow

```text
Trimble sync  ──┐
                ├──► Prisma DB ──► Portal / Mobile / Reports
File import   ──┘
```

- **Sync:** `POST /api/fabshop/sync/:idJob` (Dashboard)
- **Upload:** `POST /api/imports` then `POST /api/imports/:id/execute` (Import page)
- **Scan:** `POST /api/transits/:id/scan` (Mobile)

Identifiers: **Piece number ≠ IDItem ≠ ItemTracking**. Fab Shop “piece” column is piece number, not IDItem.

## Scripts

```bash
npm run start:dev      # watch mode
npm run build && npm run start:prod
npm run db:setup       # db push + seed
npm run db:reset       # wipe + seed
npm run prisma:studio
npm test
```

## FabShop (optional)

Set `FABSHOP_DB_*` in `.env`. Without SQL Server, sync endpoints return unavailable; manual import still works.
