# Khaanz Desktop POS

Electron wrapper around the existing Next.js **Admin POS** (`/admin/pos`). It adds:

- **Silent thermal print** — KOT/Bill HTML is sent to the default printer (or a named printer) without the browser print dialog.
- **Offline order queue** — if the register loses network while placing an order, the payload is stored locally and **re-posted automatically** when you are online again (same `clientOrderId` so the server does not duplicate orders).

## Requirements

1. Run the Next app (`npm run dev` or production `npm run start`) and sign in to admin in a **normal browser tab** once if needed, **or** sign in inside this app (same cookies/session).

## App icon

The app uses `logo/khaanz-logo.pdf.png` (square PNG, 512px+; yours is 1080×1080) for the **.app** / **.exe** / **DMG** icons via `build.icon` in `package.json`, and for the **window** icon on Windows (and where Electron applies it). Rebuild with `npm run dist` after changing the file.

## Default site URL (no command-line env for staff)

Set your **live** site once in **`desktop-pos/package.json`** under `khaanz.defaultAppUrl`, then run **`npm run dist`**. Installed apps open that origin at `/admin/pos` automatically.

```json
"khaanz": {
  "defaultAppUrl": "https://your-restaurant-domain.com"
}
```

Leave it `""` while developing: the app falls back to **`http://localhost:3000`**.

**Optional override:** `KHAANZ_APP_URL` at launch still overrides the baked URL (testing or staging).

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KHAANZ_APP_URL` | _(see above)_ | Overrides baked URL if set (no trailing slash). |
| `KHAANZ_POS_PATH` | `/admin/pos` | Path to the POS page. |
| `KHAANZ_SILENT_PRINTER` | _(empty)_ | Exact OS printer name. If unset, the system default printer is used. |
| `KHAANZ_OPEN_DEVTOOLS` | _(unset)_ | Set to `1` to open DevTools. |

### macOS / Windows: find printer names

From the project directory after `npm install`:

```bash
npx electron -e "const {app,BrowserWindow}=require('electron');app.whenReady().then(async()=>{const w=new BrowserWindow({show:false});await w.loadURL('about:blank');const p=await w.webContents.getPrintersAsync();console.log(p.map(x=>x.name));app.quit();})"
```

Use one of the printed strings as `KHAANZ_SILENT_PRINTER` if the default is wrong.

## Scripts

```bash
cd desktop-pos
npm install
npm start
```

Ship installers (requires code signing setup on your machines for distribution):

```bash
npm run dist
```

Outputs go to `desktop-pos/release/`.

### What to upload vs ignore in `release/`

**Give to staff (upload for download links):**

| File | Use |
|------|-----|
| `Khaanz POS-1.0.0-arm64.dmg` | **macOS** — drag-to-Applications installer (version in name may change). |
| `Khaanz POS Setup 1.0.0.exe` | **Windows** — NSIS installer. |

Optional: the **`.zip`** files are portable copies; many teams use **DMG + Setup.exe** only.

**You can ignore / delete for hosting:**

- **`mac-arm64/`** — unpacked `.app` (used while building the DMG).
- **`win-arm64-unpacked/`** — unpacked Windows app (same idea).
- **`*.blockmap`** — delta-update metadata for `electron-updater` (only if you configure auto-update).
- **`builder-debug.yml`**, **`builder-effective-config.yaml`** — build diagnostics.

## Hosting installers for the admin “POS app” tab

Build artifacts (`npm run dist`), upload the `.dmg` / `.exe` (or `.zip`) to any HTTPS host, then set in your Next.js env:

- `NEXT_PUBLIC_DESKTOP_POS_MAC_URL`
- `NEXT_PUBLIC_DESKTOP_POS_WINDOWS_URL`

Admin **Settings → POS app** detects the visitor’s OS (macOS vs Windows) and highlights the matching download.

## Limitations (v1)

- **Menu / settings** still load from the server; there is no full offline menu cache yet. Offline mode is meant for **taking orders when the API briefly fails** while the page was already loaded.
- **Website new-order sounds** use the same poller as the admin panel; POS must stay on a logged-in session.
