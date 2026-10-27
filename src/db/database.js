import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { SCHEMA_SQL, SEED_SQL } from './schema.js'
import { migrate } from './migrations.js'
let db = null, SQL = null
let initialization = null
export function initDatabase() {
  if (!initialization) initialization = initializeDatabase().catch(e=>{initialization=null;throw e})
  return initialization
}
async function initializeDatabase() {
  if (db) return db
  SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const data = window.jkhAPI ? await window.jkhAPI.loadDB() : null
  const candidate = new SQL.Database(data || undefined)
  try {
    candidate.run(SCHEMA_SQL)
    if (!candidate.exec("SELECT value FROM settings WHERE key='seeded'").length) candidate.run(SEED_SQL)
    migrate(candidate)
    db = candidate
    await persist()
    return db
  } catch(e) { candidate.close(); db = null; throw e }
}
export async function persist() {
  if (!db || !window.jkhAPI) return
  const result = await window.jkhAPI.saveDB(db.export())
  if (!result?.ok) throw new Error(result?.error || 'Не удалось сохранить базу')
}
export function query(sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally { stmt.free() }
}
let busy = false
export async function transaction(action) {
  if (busy) throw new Error('Дождитесь завершения сохранения')
  busy = true
  const before = db.export()
  db.run('BEGIN')
  try {
    const result = action((sql, params = []) => db.run(sql, params))
    db.run('COMMIT')
    await persist()
    return result
  } catch(e) {
    db.close(); db = new SQL.Database(before)
    throw e
  } finally { busy = false }
}
export async function run(sql, params = []) { return transaction(exec => exec(sql, params)) }
export function getSetting(key) { return query('SELECT value FROM settings WHERE key=?',[key])[0]?.value ?? null }
export async function setSetting(key,value) {
  await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,value])
}
export function exportBytes() { return db?.export() }
export async function restoreBytes(bytes) {
  if (busy) throw new Error('Дождитесь завершения сохранения')
  const candidate = new SQL.Database(bytes)
  const previous = db
  busy = true
  try {
    const integrity = candidate.exec('PRAGMA integrity_check')[0]?.values[0][0]
    if (integrity !== 'ok') throw new Error('Повреждённая база данных')
    for (const table of ['services','tariffs','readings','invoices','settings']) {
      if (!candidate.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).length) throw new Error('Это не резервная копия ЖКХ Контроль')
    }
    migrate(candidate)
    db = candidate
    // Проверяем совместимость столбцов до замены рабочего файла.
    query('SELECT s.name,s.unit,s.has_meter,t.price,t.valid_from,r.value,r.period,i.amount,i.is_paid,i.paid_at FROM services s LEFT JOIN tariffs t ON t.service_id=s.id LEFT JOIN readings r ON r.service_id=s.id LEFT JOIN invoices i ON i.service_id=s.id LIMIT 1')
    await persist()
    previous.close()
  } catch(e) { db = previous; candidate.close(); throw e } finally { busy = false }
}
