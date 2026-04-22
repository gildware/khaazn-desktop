const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("khaanzDesktop", {
  isDesktop: true,
  printSilentHtml: (html, title) =>
    ipcRenderer.invoke("khaanz:print-silent-html", { html, title }),
  listPrinters: () => ipcRenderer.invoke("khaanz:list-printers"),
  enqueueOfflineOrder: (row) =>
    ipcRenderer.invoke("khaanz:offline-enqueue", row),
  getOfflineQueue: () => ipcRenderer.invoke("khaanz:offline-get"),
  removeOfflineOrder: (clientOrderId) =>
    ipcRenderer.invoke("khaanz:offline-remove", clientOrderId),
});
