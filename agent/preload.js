/**
 * Мост между окном и главным процессом.
 * В окне нет прямого доступа к файлам и терминалу — только эти функции.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, handler) => {
  const wrapped = (event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("sye", {
  state: () => ipcRenderer.invoke("state:get"),
  activate: (key, client) => ipcRenderer.invoke("license:activate", { key, client }),
  accountSendCode: (email) => ipcRenderer.invoke("account:send-code", { email }),
  accountVerifyCode: (email, code) => ipcRenderer.invoke("account:verify-code", { email, code }),
  accountSignIn: (email, password) => ipcRenderer.invoke("account:signin", { email, password }),
  accountLink: (client) => ipcRenderer.invoke("account:link", { client }),
  accountCheck: () => ipcRenderer.invoke("account:check"),
  accountConnect: (payload) => ipcRenderer.invoke("account:connect", payload || {}),
  accountLogout: () => ipcRenderer.invoke("account:logout"),
  syncLicense: () => ipcRenderer.invoke("license:sync"),
  deactivate: () => ipcRenderer.invoke("license:deactivate"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  screenshot: () => ipcRenderer.invoke("shot:capture"),
  startTask: (task, shot) => ipcRenderer.invoke("task:start", { task, shot }),
  stopTask: () => ipcRenderer.invoke("task:stop"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  copy: (text) => ipcRenderer.invoke("copy:text", text),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  quit: () => ipcRenderer.invoke("app:quit"),

  onState: (fn) => on("state:changed", fn),
  onEvent: (fn) => on("task:event", fn),
  onDone: (fn) => on("task:done", fn),
  onShot: (fn) => on("shot:ready", fn),
  onToast: (fn) => on("toast", fn),
  onHistory: (fn) => on("history:changed", fn),
  onOpenSettings: (fn) => on("ui:openSettings", fn)
});
