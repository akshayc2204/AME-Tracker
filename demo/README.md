# Demo import files (P47184)

Sample pair for **manual Import** practice (not FabShop SQL sync).

| File | What it is |
|------|------------|
| `P47184.t4vjob` | Vulcan job export (project / job / ItemTracking units) |
| `fab-shop-p47184.xlsx` | Demo QR registry for that job |
| `scan-codes.txt` | Sample QR UUIDs to scan after import |
| `qr-map.json` | Optional mapping helper |

## Upload

1. Portal → **Import** (not Dashboard sync)
2. Drop `.t4vjob` into **Vulcan job**
3. Drop `fab-shop-p47184.xlsx` into **Fab Shop QR**
4. Optionally add a **Job report** `.xlsx` for metal / weights
5. Click **Import**

Products land as units with QR codes. Scan a UUID from `scan-codes.txt` on a new mobile transit.

## Matching reminder

- Fab Shop piece column = **piece number** (not IDItem)
- Prefer shared **Job ID** (Trimble `IDJob`) across files
- Piece number ≠ IDItem ≠ ItemTracking
