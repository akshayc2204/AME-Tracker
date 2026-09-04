# AME Tracker Mobile

Expo / React Native app for yard operators: create a transit, scan QR stickers onto the truck, capture a vehicle photo, and complete the load.

## Stack

- Expo 57 + Expo Router
- React Native
- Camera / QR scanning
- Talks to Nest API (`/api/auth`, `/api/transits`)

## Folder layout

```text
ame-tracker-mobile/
├── app/                 # Routes (login, tabs, transit/[id])
├── components/          # Scanner, photo modal, …
├── context/             # Auth
├── services/            # API helpers
├── assets/
├── .env.example
└── package.json
```

## Workflow

```text
Login (OPERATOR)
  → Home → NEW TRANSIT
  → Transit screen
  → Scan QR (repeat)
  → Vehicle photo
  → Complete
```

## Setup

```bash
cp .env.example .env
npm install
npm run start
```

### API URL

The app **auto-discovers** the API host (USB `adb reverse`, LAN IP from Metro, or emulator).

Use `npm start` / `npm run android` so `adb reverse` is applied automatically for USB devices.

Optional override in `.env`:

| Target | `EXPO_PUBLIC_API_URL` |
|--------|------------------------|
| Auto (recommended) | leave unset |
| Force LAN IP | `http://<your-LAN-IP>:3000` |

### Seed operator

`operator@ametracker.local` / `Password123!`

Backend must be running with a seeded database.
