import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// Путь к файлу базы данных в папке пользовательских данных приложения
const dbPath = path.join(app.getPath('userData'), 'jkh.sqlite')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'ЖКХ Контроль',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ===== IPC: чтение/запись файла базы данных =====
// База (sql.js) живёт в renderer как байты, а main только читает/сохраняет файл на диск.
ipcMain.handle('db:load', async () => {
  try {
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath)
      return new Uint8Array(buf)
    }
    return null
  } catch (e) {
    console.error('Ошибка чтения БД:', e)
    throw new Error('Не удалось прочитать базу. Данные не заменены: ' + e.message)
  }
})

ipcMain.handle('db:save', async (_event, data) => {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const temporary = dbPath + '.tmp'
    fs.writeFileSync(temporary, Buffer.from(data))
    fs.renameSync(temporary, dbPath)
    return { ok: true }
  } catch (e) {
    console.error('Ошибка сохранения БД:', e)
    return { ok: false, error: String(e) }
  }
})

// Резервная копия базы в выбранное место
ipcMain.handle('db:backup', async (_event, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Сохранить резервную копию',
    defaultPath: `jkh-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
    filters: [{ name: 'База данных', extensions: ['sqlite'] }]
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, Buffer.from(data))
  return { ok: true, filePath }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
