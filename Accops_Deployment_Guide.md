# AME Tracker — Complete Setup Guide Using Accops
### From Zero to Live on Kuwait Windows Server

---

## The Full Journey at a Glance

```
STEP 1-3:   Fix Accops → Get inside the server
STEP 4-7:   Install required software on server
STEP 8-10:  Transfer & configure your code
STEP 11-12: Set up the database
STEP 13:    Build the web portal
STEP 14-15: Configure Nginx (web server)
STEP 16-17: Start the app with PM2
STEP 18:    Open firewall ports
STEP 19-20: Test & verify everything works
```

---

# 🔑 PART 1 — GET ACCESS VIA ACCOPS

---

## STEP 1 — Fix Accops Access (Done in IT Meeting)

Tell IT team exactly this:

> *"We have Accops account `vulcanvendor` but Virtual Desktops shows 'Login failed'. We need Virtual Desktop access to the Windows server where Trimble FabShop is running. Please fix our Accops account or give us the Windows server IP + RDP credentials."*

**What IT needs to do:**
- Grant `vulcanvendor` access to the Windows server's Virtual Desktop in Accops
- OR provide the server's IP + Windows Administrator username + password for direct RDP

---

## STEP 2 — Connect via Accops Virtual Desktop

Once IT fixes the account:

### Open Accops Desktop App
- Press `Win + S` on your PC
- Search: **"Accops Workspace"**
- Open it

### Log In
```
Server/Gateway:  amqaaps.almullagroup.com
Username:        vulcanvendor
Password:        (your Accops password)
```

### Connect to the Server
1. Click **"Virtual Desktops"** in the left menu
2. You will see the Kuwait Windows server listed
3. Click it → a remote desktop window opens
4. **You are now inside the Kuwait server** ✅

> 💡 **Alternative:** If IT gives you direct RDP:
> Press `Win + R` → type `mstsc` → Enter
> Computer: `<server-ip>` → Username + Password → Connect

---

## STEP 3 — Verify You Are on the Right Machine

Inside the server, open **Command Prompt** and run:
```cmd
hostname
```
This shows the server's computer name. Confirm with IT it's the correct machine.

Also verify Trimble SQL Server is running:
```cmd
sc query MSSQLSERVER
```
Expected output includes: `STATE: 4 RUNNING` ✅

If service name is different:
```cmd
sc query | findstr /i "sql"
```
This lists all SQL-related services.

---

# 📦 PART 2 — INSTALL SOFTWARE ON THE SERVER

> ⚠️ All following steps are done INSIDE the Accops remote desktop session

---

## STEP 4 — Install Node.js v20 LTS

**A. Open the browser on the server**
Go to: `https://nodejs.org`

**B. Download**
Click **"20.x.x LTS"** → Downloads → **Windows Installer (.msi)**

**C. Install**
- Run the downloaded `.msi` file
- Click **Next** through all steps
- ✅ Check **"Automatically install necessary tools"** if it appears
- Click **Install** → **Finish**

**D. Verify — open Command Prompt:**
```cmd
node --version
```
✅ Expected: `v20.x.x`

```cmd
npm --version
```
✅ Expected: `10.x.x`

---

## STEP 5 — Install PostgreSQL 16

**A. Download**
Go to: `https://www.postgresql.org/download/windows/`
Click **"Download the installer"** → Select version **16.x** → Windows x86-64

**B. Run the installer**

| Setting | Value |
|---|---|
| Installation Directory | `C:\Program Files\PostgreSQL\16` |
| Components | Keep all selected |
| Data Directory | `C:\Program Files\PostgreSQL\16\data` |
| Password | `AmeDb@Kuwait2024!` ← **Write this down!** |
| Port | `5432` (keep default) |
| Locale | Default locale |

Click **Next → Next → Install**

At the end: **UNCHECK "Launch Stack Builder"** → Finish

**C. Verify — open Command Prompt:**
```cmd
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
```
Type the password you set: `AmeDb@Kuwait2024!`

You should see: `postgres=#`

Type `\q` and press Enter to exit.

---

## STEP 6 — Install Nginx for Windows

**A. Download**
Go to: `https://nginx.org/en/download.html`
Under **"Stable version"** → download the **nginx/Windows** `.zip` file

**B. Extract**
- Right-click the `.zip` → Extract All
- Extract to: `C:\nginx`

Your folder should look like:
```
C:\nginx\
├── nginx.exe   ← main program
├── conf\
│   └── nginx.conf
├── html\
└── logs\
```

**C. Test it works:**
```cmd
cd C:\nginx
nginx.exe
```
Open browser on server → go to `http://localhost`
✅ Should show "Welcome to nginx!"

Stop it for now:
```cmd
nginx.exe -s stop
```

---

## STEP 7 — Install PM2 and PM2 Windows Startup

PM2 keeps your Node.js app running 24/7 and restarts it if it crashes.

Open **Command Prompt as Administrator** (right-click → Run as administrator):

```cmd
npm install -g pm2
npm install -g pm2-windows-startup
```

Verify:
```cmd
pm2 --version
```
✅ Should show a version number like `5.x.x`

---

# 💻 PART 3 — TRANSFER YOUR CODE TO THE SERVER

---

## STEP 8 — Copy AME Tracker Code to the Server

You have several options. Use whichever works:

### Option A — USB Drive (Simplest)
1. Copy `AME-Tracker` folder to a USB drive on your PC
2. Plug USB into the Kuwait server (or use Accops file transfer)
3. Copy to: `C:\AME-Tracker\`

### Option B — Accops File Transfer
In the Accops remote desktop window:
- Look for a **file transfer button** in the top toolbar (clipboard/upload icon)
- Use it to drag files from your PC into the server session
- Copy to: `C:\AME-Tracker\`

### Option C — Zip and Share via Google Drive / OneDrive
1. On your PC: zip the `AME-Tracker` folder
2. Upload to Google Drive
3. Inside the server session: open browser → download the zip
4. Extract to `C:\AME-Tracker\`

### Option D — Git Clone (if server has internet)
Open Command Prompt on the server:
```cmd
git clone <your-github-repo-url> C:\AME-Tracker
```

---

After transfer, verify the folder structure:
```cmd
dir C:\AME-Tracker
```
Expected:
```
C:\AME-Tracker\
├── ame-tracker-backend\
└── ame-tracker-web-portal\
```

---

# ⚙️ PART 4 — CONFIGURE THE PROJECT

---

## STEP 9 — Create the .env File

```cmd
cd C:\AME-Tracker\ame-tracker-backend
notepad .env
```

Paste this **exact content** (replace `<server-ip>` with the actual server IP):

```env
# ─── AME Tracker Database (PostgreSQL on this server) ───────────────
DATABASE_URL=postgresql://ame_app:AmeDb@Kuwait2024!@localhost:5432/ame_tracker

# ─── Auth ────────────────────────────────────────────────────────────
JWT_SECRET=ame-kuwait-prod-secret-2024-changeme!
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Server ──────────────────────────────────────────────────────────
PORT=3000
CORS_ORIGINS=http://localhost,http://<server-ip>

# ─── File Storage ────────────────────────────────────────────────────
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./uploads
MAX_UPLOAD_MB=25

# ─── Trimble FabShop SQL Server (SAME machine = use localhost) ───────
FABSHOP_DB_SERVER=127.0.0.1
FABSHOP_DB_PORT=1433
FABSHOP_DB_DATABASE=TrimbleFabShop (US Metric)
FABSHOP_DB_USER=sa
FABSHOP_DB_PASSWORD=Trimble12024!
FABSHOP_DB_ENCRYPT=false
```

Save (Ctrl+S) → Close Notepad

---

## STEP 10 — Install Node.js Dependencies

```cmd
cd C:\AME-Tracker\ame-tracker-backend
npm install
```

Wait for it to complete (2–5 minutes). You'll see packages being downloaded.

✅ Expected ending: `added XXXX packages`

---

# 🗄️ PART 5 — SET UP THE DATABASE

---

## STEP 11 — Create AME Database and User in PostgreSQL

Open **Command Prompt as Administrator**:

```cmd
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
```

Enter password: `AmeDb@Kuwait2024!`

Now run these SQL commands one by one:

```sql
CREATE DATABASE ame_tracker;

CREATE USER ame_app WITH PASSWORD 'AmeDb@Kuwait2024!';

GRANT ALL PRIVILEGES ON DATABASE ame_tracker TO ame_app;

ALTER DATABASE ame_tracker OWNER TO ame_app;

\q
```

---

## STEP 12 — Run Prisma Migration (Creates All AME Tables)

This creates all the tables in PostgreSQL — Users, Projects, Jobs, Items, Parts, etc.

```cmd
cd C:\AME-Tracker\ame-tracker-backend
npx prisma migrate deploy
```

✅ Expected output:
```
Applying migration `XXXXXXXXXX_init`
All migrations have been applied.
```

Create the first Admin user:
```cmd
npx prisma db seed
```

---

# 🌐 PART 6 — BUILD THE WEB PORTAL

---

## STEP 13 — Build the Frontend

```cmd
cd C:\AME-Tracker\ame-tracker-web-portal
npm install
npm run build
```

Wait for build to complete (2–3 minutes).

✅ After this, a `dist` folder appears:
```
C:\AME-Tracker\ame-tracker-web-portal\dist\
├── index.html
├── assets\
└── ...
```

This is what users see in their browser.

---

# 🔀 PART 7 — CONFIGURE NGINX (Web Server)

---

## STEP 14 — Edit Nginx Configuration

Open the Nginx config file:
```cmd
notepad C:\nginx\conf\nginx.conf
```

**Delete everything** and replace with:

```nginx
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    client_max_body_size 30M;

    server {
        listen 80;
        server_name localhost;

        # ── Serve the AME Web Portal (React app) ──────────────────
        location / {
            root   C:/AME-Tracker/ame-tracker-web-portal/dist;
            index  index.html;
            try_files $uri $uri/ /index.html;
        }

        # ── Forward all /api/ requests to NestJS backend ──────────
        location /api/ {
            proxy_pass         http://127.0.0.1:3000/;
            proxy_http_version 1.1;
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }
    }
}
```

Save and close.

**Test the config:**
```cmd
cd C:\nginx
nginx.exe -t
```
✅ Expected: `configuration file C:\nginx/conf/nginx.conf test is successful`

---

## STEP 15 — Install Nginx as a Windows Service (Auto-Start)

Download **NSSM** (Non-Sucking Service Manager):
- Go to: `https://nssm.cc/download`
- Download the zip → Extract to `C:\nssm\`

Install Nginx as a service:
```cmd
C:\nssm\win64\nssm.exe install nginx
```

In the window that opens:
```
Path:            C:\nginx\nginx.exe
Startup dir:     C:\nginx
Service name:    nginx
```

Click **"Install Service"**

Start the service:
```cmd
net start nginx
```

---

# 🚀 PART 8 — START THE APP

---

## STEP 16 — Start NestJS Backend with PM2

```cmd
cd C:\AME-Tracker\ame-tracker-backend
pm2 start npm --name "ame-tracker-api" -- start
```

Check it's running:
```cmd
pm2 status
```

✅ Expected:
```
┌─────────────────────┬────────┬─────────┐
│ name                │ status │ cpu     │
├─────────────────────┼────────┼─────────┤
│ ame-tracker-api     │ online │ 0%      │
└─────────────────────┴────────┴─────────┘
```

Check logs (make sure no errors):
```cmd
pm2 logs ame-tracker-api --lines 30
```

✅ Look for: `Application is running on: http://localhost:3000`

---

## STEP 17 — Make PM2 Auto-Start on Windows Reboot

```cmd
pm2-startup install
pm2 save
```

✅ Now if the server reboots, your app automatically starts.

---

# 🔥 PART 9 — OPEN FIREWALL PORTS

---

## STEP 18 — Windows Firewall Rules

Open **Command Prompt as Administrator** and run:

```cmd
REM Allow HTTP (users access AME portal)
netsh advfirewall firewall add rule name="AME Tracker HTTP" dir=in action=allow protocol=TCP localport=80

REM Block direct API access from outside (security)
netsh advfirewall firewall add rule name="Block Direct API" dir=in action=block protocol=TCP localport=3000

REM Block direct DB access from outside (security)
netsh advfirewall firewall add rule name="Block Direct PostgreSQL" dir=in action=block protocol=TCP localport=5432
```

---

# ✅ PART 10 — TEST EVERYTHING

---

## STEP 19 — Verify Each Component

Run these checks on the server:

```cmd
REM 1. Check PostgreSQL is running
sc query postgresql-x64-16 | findstr STATE

REM 2. Check PM2 app is running
pm2 status

REM 3. Check Nginx is running
sc query nginx | findstr STATE

REM 4. Test NestJS API directly
curl http://localhost:3000/health

REM 5. Test Trimble SQL connection
curl http://localhost:3000/fabshop/status

REM 6. Open browser on server
REM    → http://localhost
REM    → AME Tracker login page should appear ✅
```

---

## STEP 20 — Test from Shop Floor Device

On any phone or PC connected to the same Kuwait office network:

```
Open browser → http://<server-ip>
→ AME Tracker login page appears ✅
→ Log in with admin credentials ✅
→ Go to FabShop section → verify Trimble connection shows Online ✅
→ Pick a job → click Sync → parts appear in AME ✅
```

---

# 🎉 DEPLOYMENT COMPLETE

```
✅ Accops → Connected to Kuwait server
✅ Node.js v20 installed
✅ PostgreSQL 16 installed + AME database created
✅ Nginx installed + serving web portal on port 80
✅ Code deployed to C:\AME-Tracker\
✅ .env configured (Trimble = localhost)
✅ Prisma migration run (all tables created)
✅ PM2 running ame-tracker-api (auto-restarts on crash)
✅ Firewall ports configured
✅ Trimble FabShop connection: Online
✅ Shop floor devices can access: http://<server-ip>
```

---

## Useful Daily Commands

```cmd
# Check app status
pm2 status

# Restart app (after code update)
pm2 restart ame-tracker-api

# View live logs
pm2 logs ame-tracker-api

# Restart Nginx
net stop nginx && net start nginx

# Check PostgreSQL
sc query postgresql-x64-16
```
