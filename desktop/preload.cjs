/**
 * Brücke zwischen Oberfläche und Programm (Windows/Linux): nur diese wenigen Funktionen sind
 * für die App sichtbar (window.zkDesktop). Kein direkter Zugriff auf Dateien oder System.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zkDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('zk:info'),
  openPresentation: () => ipcRenderer.invoke('zk:open-presentation'),
  chooseBackupFolder: () => ipcRenderer.invoke('zk:choose-backup-folder'),
  backupFolder: () => ipcRenderer.invoke('zk:backup-folder'),
  clearBackupFolder: () => ipcRenderer.invoke('zk:clear-backup-folder'),
  backupList: () => ipcRenderer.invoke('zk:backup-list'),
  backupWrite: (filename, content) => ipcRenderer.invoke('zk:backup-write', filename, content),
  backupRemove: (filename) => ipcRenderer.invoke('zk:backup-remove', filename),
  getAutostart: () => ipcRenderer.invoke('zk:get-autostart'),
  setAutostart: (on) => ipcRenderer.invoke('zk:set-autostart', on),
  printers: () => ipcRenderer.invoke('zk:printers'),
  printDirect: (options) => ipcRenderer.invoke('zk:print-direct', options),
});
