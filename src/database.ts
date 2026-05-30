import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

// 获取数据库实例
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('mikumo_coffee.db');

  // 启用 WAL 模式提升并发性能
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // 建表
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS coffee_beans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      country TEXT,
      region TEXT,
      farm TEXT,
      variety TEXT,
      process_method TEXT,
      roast_level TEXT,
      flavor TEXT,
      net_weight REAL NOT NULL,
      total_price REAL NOT NULL,
      unit_price TEXT NOT NULL,
      roast_date TEXT NOT NULL,
      open_date TEXT,
      best_days INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 兼容旧表：补齐可能缺失的列
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info('coffee_beans')");
  const colNames = cols.map(c => c.name);
  const newCols = [
    { name: 'brand', def: 'TEXT' },
    { name: 'country', def: 'TEXT' },
    { name: 'region', def: 'TEXT' },
    { name: 'farm', def: 'TEXT' },
    { name: 'variety', def: 'TEXT' },
    { name: 'process_method', def: 'TEXT' },
    { name: 'roast_date', def: 'TEXT' },
  ];
  for (const col of newCols) {
    if (!colNames.includes(col.name)) {
      await db.execAsync(`ALTER TABLE coffee_beans ADD COLUMN ${col.name} ${col.def}`);
    }
  }
  // 如果有旧 purchase_date 列，数据迁移到 roast_date
  if (colNames.includes('purchase_date') && colNames.includes('roast_date')) {
    await db.execAsync(`UPDATE coffee_beans SET roast_date = purchase_date WHERE roast_date IS NULL AND purchase_date IS NOT NULL`);
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS brew_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bean_id INTEGER NOT NULL,
      dose_grams REAL NOT NULL,
      brew_method TEXT,
      water_temp REAL,
      grind_size TEXT,
      flavor_notes TEXT,
      brew_datetime TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (bean_id) REFERENCES coffee_beans(id)
    );
  `);

  // 为 brew_logs 的 bean_id 创建索引，加速聚合查询
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_brew_logs_bean_id ON brew_logs(bean_id);
  `);

  return db;
}

// 获取当前时间字符串（ISO8601 本地时间）
export function now(): string {
  return new Date().toISOString();
}
