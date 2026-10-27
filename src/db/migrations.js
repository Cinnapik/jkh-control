export function migrate(db) {
  const version = db.exec('PRAGMA user_version')[0]?.values[0][0] || 0
  if (version > 3) throw new Error('База создана более новой версией приложения')
  db.run('BEGIN')
  try {
    const add = (table, column, definition) => {
      const columns = db.exec(`PRAGMA table_info(${table})`)[0].values.map(r => r[1])
      if (!columns.includes(column)) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    add('services', 'meter_enabled', 'INTEGER NOT NULL DEFAULT 1')
    add('services', 'enabled', 'INTEGER NOT NULL DEFAULT 1')
    add('tariffs', 'kind', "TEXT NOT NULL DEFAULT 'flat'")
    add('tariffs', 'tiers', 'TEXT')
    add('invoices', 'source', "TEXT NOT NULL DEFAULT 'manual'")
    add('invoices', 'tariff_id', 'INTEGER')
    add('invoices', 'needs_review', 'INTEGER NOT NULL DEFAULT 0')
    db.run(`INSERT INTO services(name,unit,color,has_meter)
      SELECT 'Интернет','мес.','#6366f1',0 WHERE NOT EXISTS(SELECT 1 FROM services WHERE name='Интернет')`)
    add('tariffs', 'deleted', 'INTEGER NOT NULL DEFAULT 0')
    db.run(`INSERT INTO services(name,unit,color,has_meter)
      SELECT 'Водоотведение','м³','#14b8a6',0 WHERE NOT EXISTS(SELECT 1 FROM services WHERE name='Водоотведение')`)
    db.run('PRAGMA user_version = 3')
    db.run('COMMIT')
  } catch (e) { db.run('ROLLBACK'); throw e }
}
