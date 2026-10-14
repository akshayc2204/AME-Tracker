# Trimble SQL Server — Read-Only Access Setup
### Creating a Secure Read-Only User for AME Tracker

---

## Why Read-Only Access?

Using the `sa` account for AME Tracker is risky:

| Account | Can Do | Risk |
|---|---|---|
| `sa` (current) | READ + WRITE + DELETE + DROP tables | 😱 High — full control of Trimble data |
| `ame_readonly` (target) | SELECT only — no changes possible | ✅ Safe — cannot touch any data |

> Your NestJS code already has a guard that blocks non-SELECT queries, but using `sa` is still unprofessional and dangerous. A dedicated read-only user is the correct production approach.

---

## Prerequisites

- ✅ Accops Virtual Desktop access to the Kuwait Windows Server
- ✅ `sa` login credentials: `sa` / `Trimble12024!`
- ✅ SQL Server Management Studio (SSMS) installed on the server

---

## STEP 1 — Connect to the Server via Accops

- Open **Accops Workspace** on your PC
- Go to **Virtual Desktops**
- Click the Kuwait Windows Server
- You are now inside the server

---

## STEP 2 — Open SQL Server Management Studio (SSMS)

On the server:
- Press `Win + S`
- Search: **"SQL Server Management Studio"**
- Open it

---

## STEP 3 — Connect to SQL Server

Fill in the connection dialog:

```
Server type:      Database Engine
Server name:      localhost
                  (try  .\SQLEXPRESS  or  .  if localhost doesn't work)
Authentication:   SQL Server Authentication
Login:            sa
Password:         Trimble12024!
```

Click **Connect**

> 💡 If you see the Object Explorer panel on the left with databases listed — you are connected ✅

---

## STEP 4 — Create the Read-Only Login & User

Click **New Query** in the top toolbar and paste this entire script:

```sql
-- ── STEP 1: Create the login at SQL Server level ─────────────────────
USE master;
GO

CREATE LOGIN ame_readonly
WITH PASSWORD       = 'AmeReadOnly@Kuwait2024!',
     CHECK_POLICY   = OFF,
     CHECK_EXPIRATION = OFF;
GO

-- ── STEP 2: Create a user in the Trimble database ────────────────────
USE [TrimbleFabShop (US Metric)];
GO

CREATE USER ame_readonly FOR LOGIN ame_readonly;
GO

-- ── STEP 3: Grant READ-ONLY role (SELECT only — no write/delete) ─────
EXEC sp_addrolemember 'db_datareader', 'ame_readonly';
GO

PRINT 'Done! ame_readonly user created successfully.';
```

Press **F5** or click **Execute**

✅ Expected output at the bottom:
```
Done! ame_readonly user created successfully.
```

---

## STEP 5 — Verify the Read-Only User Works

Open a **New Query** window and run these two tests:

### Test 1 — SELECT should work ✅
```sql
USE [TrimbleFabShop (US Metric)];

SELECT TOP 5 IDJob, JobName
FROM Jobs;
```
✅ Expected: Returns 5 job rows

---

### Test 2 — INSERT should be blocked ✅
```sql
USE [TrimbleFabShop (US Metric)];

INSERT INTO Jobs (JobName) VALUES ('test-ame');
```
✅ Expected error:
```
The INSERT permission was denied on the object 'Jobs',
database 'TrimbleFabShop (US Metric)', schema 'dbo'.
```

> If INSERT fails → your read-only user is correctly set up 🎉

---

## STEP 6 — Update .env on the AME Tracker Server

Open `C:\AME-Tracker\ame-tracker-backend\.env` and update:

```env
# ── BEFORE (sa — full admin, risky) ──────────────────────────────────
FABSHOP_DB_USER=sa
FABSHOP_DB_PASSWORD=Trimble12024!

# ── AFTER (ame_readonly — safe, read-only) ───────────────────────────
FABSHOP_DB_USER=ame_readonly
FABSHOP_DB_PASSWORD=AmeReadOnly@Kuwait2024!
```

---

## STEP 7 — Restart the App

```cmd
pm2 restart ame-tracker-api
```

Then verify Trimble connection is still working:
```cmd
pm2 logs ame-tracker-api --lines 20
```

✅ Look for: `Connected to TrimbleFabShop SQL Server (read-only)`

Or test via API:
```cmd
curl http://localhost:3000/fabshop/status
```
✅ Expected: `{"connected": true}`

---

## Summary

| Step | Who | Action |
|---|---|---|
| 1–3 | You | Connect to server via Accops, open SSMS |
| 4 | You | Run SQL script to create `ame_readonly` user |
| 5 | You | Test SELECT works, INSERT is blocked |
| 6 | You | Update `.env` with new credentials |
| 7 | You | Restart app with `pm2 restart` |

> ✅ **You don't need IT for any of this** — once you have Accops Virtual Desktop access and can log into SSMS with `sa`, everything above is done by you alone.

---

## Question to Ask IT in the Meeting

> *"Can you confirm the `sa` account is enabled on the Trimble SQL Server instance? We need to log in once with `sa` to create a dedicated read-only user for our application — after that we will not use `sa` again."*

---

## Credentials Reference

| | Username | Password | Access |
|---|---|---|---|
| **Trimble SA (temp use)** | `sa` | `Trimble12024!` | Full admin — use once to create readonly user |
| **AME Read-Only (permanent)** | `ame_readonly` | `AmeReadOnly@Kuwait2024!` | SELECT only — safe for production |
