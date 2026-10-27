// Схема базы данных ЖКХ. Выполняется один раз при первом запуске.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS services (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,          -- Напр. "Холодная вода"
  unit      TEXT NOT NULL,          -- Единица: м³, кВт·ч, Гкал, мес.
  color     TEXT DEFAULT '#3b82f6', -- Цвет для карточек/графиков
  has_meter INTEGER DEFAULT 1       -- 1 = есть счётчик, 0 = фикс. платёж
);

CREATE TABLE IF NOT EXISTS tariffs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  price      REAL NOT NULL,         -- Цена за единицу
  valid_from TEXT NOT NULL,         -- Дата начала действия (YYYY-MM-DD)
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS readings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  value      REAL NOT NULL,         -- Показание счётчика
  period     TEXT NOT NULL,         -- Месяц YYYY-MM
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  period     TEXT NOT NULL,         -- Месяц YYYY-MM
  consumption REAL DEFAULT 0,       -- Расход (разница показаний)
  amount     REAL NOT NULL,         -- Сумма к оплате
  is_paid    INTEGER DEFAULT 0,     -- 0 = не оплачено, 1 = оплачено
  paid_at    TEXT,                  -- Дата оплаты
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

// Данные по умолчанию при самом первом запуске (типовые услуги ЖКХ).
export const SEED_SQL = `
INSERT INTO services (name, unit, color, has_meter) VALUES
  ('Холодная вода', 'м³', '#38bdf8', 1),
  ('Горячая вода', 'м³', '#f97316', 1),
  ('Электричество', 'кВт·ч', '#facc15', 1),
  ('Газ', 'м³', '#22c55e', 1),
  ('Отопление', 'Гкал', '#ef4444', 1),
  ('Содержание жилья', 'мес.', '#a855f7', 0),
  ('Вывоз мусора', 'мес.', '#64748b', 0);

INSERT INTO settings (key, value) VALUES
  ('address', ''),
  ('area', ''),
  ('currency', '₽'),
  ('seeded', '1');
`;
