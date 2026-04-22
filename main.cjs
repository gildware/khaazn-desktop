const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

/**
 * Production URL baked in at build time: set `khaanz.defaultAppUrl` in this folder's
 * package.json before `npm run dist`. Empty string = not set (dev falls back to localhost).
 * `KHAANZ_APP_URL` still overrides at launch for power users / testing.
 */
function readBakedDefaultAppUrl() {
  try {
    const pkgPath = path.join(__dirname, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const u = pkg.khaanz && typeof pkg.khaanz.defaultAppUrl === "string"
      ? pkg.khaanz.defaultAppUrl.trim()
      : "";
    if (u.startsWith("http://") || u.startsWith("https://")) {
      return u.replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Base URL of the Next app (no trailing slash). */
function appOrigin() {
  const fromEnv = (process.env.KHAANZ_APP_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const baked = readBakedDefaultAppUrl();
  if (baked) return baked;
  return "http://localhost:3000";
}

function posUrl() {
  const p = process.env.KHAANZ_POS_PATH || "/admin/pos";
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${appOrigin()}${pathPart}`;
}

/** Window / taskbar icon (also matches `build.icon` in package.json for installers). */
function appWindowIconPath() {
  const p = path.join(__dirname, "logo", "khaanz-logo.pdf.png");
  return fs.existsSync(p) ? p : undefined;
}

function queuePath() {
  return path.join(app.getPath("userData"), "pos-offline-queue.json");
}

function readQueue() {
  try {
    const raw = fs.readFileSync(queuePath(), "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeQueue(rows) {
  fs.mkdirSync(path.dirname(queuePath()), { recursive: true });
  fs.writeFileSync(queuePath(), JSON.stringify(rows), "utf8");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: appWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: "Khaanz POS",
  });

  mainWindow.loadURL(posUrl());

  if (process.env.KHAANZ_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("khaanz:print-silent-html", async (_evt, payload) => {
  const html = payload && typeof payload.html === "string" ? payload.html : "";
  const title =
    payload && typeof payload.title === "string" && payload.title.length < 200
      ? payload.title
      : "Receipt";
  const max = 600_000;
  if (!html || html.length > max) {
    return { ok: false, error: "Invalid print payload." };
  }

  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    title,
  )}</title></head><body>${html}</body></html>`;

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 900,
      webPreferences: { sandbox: false },
    });
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;

    const fail = (error) => {
      win.close();
      resolve({ ok: false, error: error || "Print failed" });
    };

    win.webContents.once("did-fail-load", (_e, _code, desc) => {
      fail(desc || "Load failed");
    });

    win.webContents.once("did-finish-load", () => {
      const deviceName = (process.env.KHAANZ_SILENT_PRINTER || "").trim() || undefined;
      win.webContents.print(
        { silent: true, printBackground: true, deviceName },
        (success, failureReason) => {
          win.close();
          if (success) resolve({ ok: true });
          else resolve({ ok: false, error: failureReason || "Print failed" });
        },
      );
    });

    win.loadURL(dataUrl).catch((e) => fail(String(e.message || e)));
  });
});

ipcMain.handle("khaanz:list-printers", async () => {
  const w =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!w) return [];
  try {
    const list = await w.webContents.getPrintersAsync();
    return list.map((p) => ({ name: p.name, isDefault: p.isDefault }));
  } catch {
    return [];
  }
});

ipcMain.handle("khaanz:offline-enqueue", async (_evt, row) => {
  if (!row || typeof row.clientOrderId !== "string" || !row.body) {
    return { ok: false, error: "Invalid queue row." };
  }
  const id = row.clientOrderId.trim();
  if (id.length !== 36) {
    return { ok: false, error: "Invalid clientOrderId." };
  }
  const q = readQueue().filter((r) => r.clientOrderId !== id);
  q.push({
    clientOrderId: id,
    body: row.body,
    createdAt: new Date().toISOString(),
  });
  writeQueue(q);
  return { ok: true };
});

ipcMain.handle("khaanz:offline-get", async () => readQueue());

ipcMain.handle("khaanz:offline-remove", async (_evt, clientOrderId) => {
  if (typeof clientOrderId !== "string") return { ok: false };
  const id = clientOrderId.trim();
  const q = readQueue().filter((r) => r.clientOrderId !== id);
  writeQueue(q);
  return { ok: true };
});
