# Server Setup Requirements – AME Tracker

**Project:** AME Tracker  
**Document purpose:** Infrastructure / IT provisioning request for Application Team deployment  
**Environments:** DEV / UAT / PROD

---

## 1. Project Technology

| Component | Technology |
|-----------|------------|
| Backend | NestJS (Node.js) + Prisma |
| Web Frontend | React + Vite (production static build served by Nginx) |
| Mobile | Expo / React Native (shop-floor QR scan & dispatch) |
| Database | PostgreSQL (**hosted on client infrastructure**) |
| Realtime | Socket.IO (live dashboard updates) |
| Git | Managed by Application Team |
| Logs | Managed by Application Team |
| Environment Variables | Managed by Application Team |
| DB Tables / Migrations | Managed by Application Team |

**Note:** Job/product data is loaded via **file import** and optional **folder auto-sync**. No external Trimble / FabShop database connection is required for this deployment approach.

---

## 2. Infrastructure & Access Requirements

### Accops Access

- Accops account/access for required team members
- Access to the required server environment through Accops
- Terminal/SSH access to the server
- Required permissions for server administration

### Server / VM

Please provision a server with:

| Item | Requirement |
|------|-------------|
| OS | Linux — preferably the same OS/version as the existing AMG-RMS server |
| CPU | As per project / environment requirement |
| RAM | As per project / environment requirement |
| Storage | Sufficient for OS, application, uploads, reports, and logs |
| Hostname | Project-specific hostname |
| Network | Static private IP on the required internal VLAN/network |
| Access | SSH access |
| Privileges | Sudo access for the Application Team |

### Suggested sizing (for discussion)

| Environment | CPU | RAM | Storage |
|-------------|-----|-----|---------|
| DEV | 2–4 vCPU | 4–8 GB | 50+ GB |
| UAT / PROD | 4+ vCPU | 8–16 GB | 100+ GB |

---

## 3. Network & Firewall Requirements

The server should have the required inbound/outbound connectivity.

### Inbound ports (application server)

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH / Server administration |
| 80 | TCP | HTTP (redirect to HTTPS) |
| 443 | TCP | HTTPS — React frontend, NestJS API, and Socket.IO via Nginx |

### Internal-only ports (not publicly exposed)

| Port | Protocol | Purpose |
|------|----------|---------|
| 3000* | TCP | NestJS backend (prefer reverse-proxy via 443 in UAT/PROD) |
| 5432* | TCP | PostgreSQL (application server ↔ database only) |

\* Actual ports depend on project configuration. Only ports that are actually required should be opened. **Do not expose PostgreSQL or NestJS directly to the public internet.**

**Note:** Port **5173** is Vite development only and is **not** required in UAT/PROD.

### Required connectivity

The application server should be able to connect to:

- PostgreSQL database server on port **5432**
- Required internal services
- Git repository
- DNS / NTP
- npm registry (if builds are performed on the server)
- Shared import folder via SMB / NFS / CIFS (if folder auto-sync is used)

### Mobile / shop-floor network

- Handhelds / tablets on WLAN must reach the **Frontend URL** and **Backend/API URL** (typically HTTPS on port 443)
- Devices must be able to upload camera / vehicle photos to the API

### Database exposure rule

Database access must be restricted to the application server / approved internal network and **must not be publicly exposed**.

---

## 4. Software / Runtime Requirements

### Backend – NestJS

The server should have:

- Node.js **20 LTS** (Node.js 22 also acceptable)
- npm
- Required Node / NestJS build dependencies
- Process supervisor support (**systemd** or **PM2**) — Application Team will configure the service

The NestJS application will be deployed and managed by the Application Team.

### Frontend – React

The server should support:

- Node.js / npm for React (Vite) build
- Required frontend build dependencies

The React application will be served as static files through Nginx (or the approved web server).

### Nginx / Web Server

Required:

- Nginx installation
- Reverse proxy configuration for NestJS (`/api`)
- WebSocket / Socket.IO upgrade support (live dashboard)
- React static file hosting
- HTTP → HTTPS redirection
- Proxy timeout configuration suitable for import and report generation
- Upload body size support: `client_max_body_size` **≥ 25 MB** (file imports and truck photos)
- Serving or proxying of application `/uploads` content

---

## 5. Database Connectivity

### Hosting model

PostgreSQL will run on **client infrastructure** (same VM or a separate DB server provided by the client).

### Infrastructure team provides

- Database server / hostname
- Database type: **PostgreSQL**
- Database port: **5432**
- Network / firewall connectivity between application server and database
- Required database access / credentials as agreed

### Application Team handles

- Database creation (if permitted)
- Database users / configuration
- Tables
- Migrations (Prisma)
- Seed / master data
- Application database configuration (`.env` / `DATABASE_URL`)
- DB-related application setup

---

## 6. Domain & SSL

### Required from Infrastructure / Network / Domain team

- Project-specific domain / subdomain
- DNS configuration
- Mapping of domain / subdomain to the server
- SSL certificate
- HTTPS configuration

### Expected traffic flow

```text
                 Domain (HTTPS)
                        ↓
                      Nginx
                 ↙           ↘
           React static      NestJS (internal :3000)
                                  ↓
                             PostgreSQL
                                  ↑
                    Mobile devices (HTTPS API)
```

### Disk / path planning

Also plan storage for:

- Application uploads (import files, dispatch photos)
- Optional mounted path for folder auto-sync (`DATA_UPLOADS_PATH`)

---

## 7. Application Team Responsibilities

The following will be handled by the Application Team:

- Git repository and Git access
- Application code deployment
- Node.js / NestJS configuration
- React build and deployment
- Mobile app API URL / environment configuration
- Environment variables / `.env`
- Database configuration
- Database tables and migrations
- Seed / master data
- Application logs
- Application monitoring configuration
- Application-level backups
- Application restart / deployment process
- Third-party API configuration (if any)
- Application testing

---

## 8. Infrastructure Team Responsibilities

The Infrastructure / IT team is requested to provide:

- Accops access
- Server / VM provisioning
- OS installation
- CPU / RAM / storage allocation
- Hostname and IP
- Network / VLAN configuration
- SSH and sudo access
- Firewall / required port access
- Application-to-PostgreSQL connectivity
- Nginx installation / support
- DNS configuration
- SSL certificate / configuration
- Required internal / external network access
- Shared folder mount for auto-import (if used)
- Mobile / WLAN reachability to application URLs

---

## 9. Final Pre-Production Checklist

- [ ] Accops access working
- [ ] Server accessible through SSH
- [ ] Sudo access available
- [ ] Server hostname / IP configured
- [ ] Required Node.js / npm version installed (20+)
- [ ] Required firewall ports opened (80 / 443; DB not public)
- [ ] Database connectivity and DB port confirmed (PostgreSQL 5432)
- [ ] Nginx installed / configured (incl. WebSocket + upload size)
- [ ] Domain configured
- [ ] SSL / HTTPS working
- [ ] NestJS backend accessible
- [ ] React dashboard accessible
- [ ] Mobile device can reach API over Wi‑Fi
- [ ] File upload path writable
- [ ] Folder-sync path mounted (if used)
- [ ] Application deployment completed
- [ ] End-to-end connectivity tested (login → import → scan → report)

---

## 10. Required Details to Share With Application Team

Please complete and return:

```text
Project Name: AME Tracker
Environment: DEV / UAT / PROD

Server Hostname:
Server IP:
OS / Version:
CPU:
RAM:
Storage:

Accops Access:
SSH Access:
Sudo Access:

Database Type: PostgreSQL
Database Host:
Database Port: 5432
Database Name:

Application Port (internal): 3000
Frontend: Nginx static (no 5173 in production)

Domain:
Frontend URL:
Backend / API URL:
Socket.IO / WebSocket via same API URL: Yes

SSL Status:
Nginx Status (incl. WebSocket + upload size):

Firewall / Allowed Ports:
Mobile / WLAN access to API confirmed:
Shared DataUploads path / mount: (if applicable)
```

---

*Document aligned to current AME Tracker stack: NestJS + React (Vite) + Expo mobile + PostgreSQL on client infrastructure. File import / folder sync only — no external FabShop SQL Server dependency for this deployment approach.*
