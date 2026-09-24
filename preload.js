// 预加载脚本：通过 contextBridge 向界面暴露最小 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveItem: (item) => ipcRenderer.invoke('data:saveItem', item),
  trashItem: (id) => ipcRenderer.invoke('data:trashItem', id),
  restoreItem: (id) => ipcRenderer.invoke('data:restoreItem', id),
  purgeItem: (id) => ipcRenderer.invoke('data:purgeItem', id),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder')
});
