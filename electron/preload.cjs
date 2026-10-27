// Безопасный мост между интерфейсом (renderer) и системой (main).
// Через window.jkhAPI интерфейс может читать/сохранять файл базы данных.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jkhAPI', {
  loadDB: () => ipcRenderer.invoke('db:load'),
  saveDB: (data) => ipcRenderer.invoke('db:save', data),
  backupDB: (data) => ipcRenderer.invoke('db:backup', data)
})
