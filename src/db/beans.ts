import * as SQLite from 'expo-sqlite';
import { getDatabase, now } from '../database';

// 咖啡豆数据类型
export interface CoffeeBean {
  id: number;
  name: string;
  brand: string | null;
  country: string | null;
  region: string | null;
  farm: string | null;
  variety: string | null;
  process_method: string | null;
  roast_level: string | null;
  flavor: string | null;
  net_weight: number;
  total_price: number;
  unit_price: string;
  roast_date: string;
  open_date: string | null;
  best_days: number | null;
  is_active: number;
  remaining_weight: number;   // 实时计算
  remaining_value: number;    // 实时计算
  created_at: string;
  updated_at: string;
}

export interface BeanInput {
  name: string;
  brand?: string;
  country?: string;
  region?: string;
  farm?: string;
  variety?: string;
  process_method?: string;
  roast_level?: string;
  flavor?: string;
  net_weight: number;
  total_price: number;
  roast_date: string;
  open_date?: string;
  best_days?: number;
}

// 获取所有活跃咖啡豆，含实时剩余克数和剩余价值
export async function getAllBeans(): Promise<CoffeeBean[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CoffeeBean>(`
    SELECT
      c.*,
      c.net_weight - COALESCE(
        (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
      ) AS remaining_weight,
      CAST(c.unit_price AS REAL) * (
        c.net_weight - COALESCE(
          (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
        )
      ) AS remaining_value
    FROM coffee_beans c
    WHERE c.is_active = 1
    ORDER BY c.updated_at DESC
  `);
  return rows;
}

// 获取所有豆子（含已用完）
export async function getAllBeansIncludingInactive(): Promise<CoffeeBean[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CoffeeBean>(`
    SELECT
      c.*,
      c.net_weight - COALESCE(
        (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
      ) AS remaining_weight,
      CAST(c.unit_price AS REAL) * (
        c.net_weight - COALESCE(
          (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
        )
      ) AS remaining_value
    FROM coffee_beans c
    ORDER BY c.is_active DESC, c.updated_at DESC
  `);
  return rows;
}

// 获取单个豆子
export async function getBeanById(id: number): Promise<CoffeeBean | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CoffeeBean>(`
    SELECT
      c.*,
      c.net_weight - COALESCE(
        (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
      ) AS remaining_weight,
      CAST(c.unit_price AS REAL) * (
        c.net_weight - COALESCE(
          (SELECT SUM(b.dose_grams) FROM brew_logs b WHERE b.bean_id = c.id), 0
        )
      ) AS remaining_value
    FROM coffee_beans c
    WHERE c.id = ?
  `, [id]);
  return row ?? null;
}

// 计算克价（保留 4 位小数）
function calcUnitPrice(totalPrice: number, netWeight: number): string {
  return (totalPrice / netWeight).toFixed(4);
}

// 添加咖啡豆
export async function insertBean(input: BeanInput): Promise<number> {
  const db = await getDatabase();
  const unitPrice = calcUnitPrice(input.total_price, input.net_weight);
  const result = await db.runAsync(
    `INSERT INTO coffee_beans (name, brand, country, region, farm, variety, process_method, roast_level, flavor, net_weight, total_price, unit_price, roast_date, purchase_date, open_date, best_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.brand ?? null,
      input.country ?? null,
      input.region ?? null,
      input.farm ?? null,
      input.variety ?? null,
      input.process_method ?? null,
      input.roast_level ?? null,
      input.flavor ?? null,
      input.net_weight,
      input.total_price,
      unitPrice,
      input.roast_date,
      input.roast_date,  // 兼容旧表 purchase_date NOT NULL
      input.open_date ?? null,
      input.best_days ?? null,
      now(),
      now(),
    ]
  );
  return result.lastInsertRowId;
}

// 更新咖啡豆
export async function updateBean(id: number, input: BeanInput): Promise<void> {
  const db = await getDatabase();
  const unitPrice = calcUnitPrice(input.total_price, input.net_weight);
  await db.runAsync(
    `UPDATE coffee_beans SET
      name = ?, brand = ?, country = ?, region = ?, farm = ?, variety = ?,
      process_method = ?, roast_level = ?, flavor = ?,
      net_weight = ?, total_price = ?, unit_price = ?,
      roast_date = ?, purchase_date = ?, open_date = ?, best_days = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.brand ?? null,
      input.country ?? null,
      input.region ?? null,
      input.farm ?? null,
      input.variety ?? null,
      input.process_method ?? null,
      input.roast_level ?? null,
      input.flavor ?? null,
      input.net_weight,
      input.total_price,
      unitPrice,
      input.roast_date,
      input.roast_date,  // 兼容旧表 purchase_date NOT NULL
      input.open_date ?? null,
      input.country ?? null,
      input.region ?? null,
      input.farm ?? null,
      input.variety ?? null,
      input.process_method ?? null,
      input.roast_level ?? null,
      input.flavor ?? null,
      input.net_weight,
      input.total_price,
      unitPrice,
      input.roast_date,
      input.open_date ?? null,
      input.best_days ?? null,
      now(),
      id,
    ]
  );
}

// 标记豆子用完
export async function deactivateBean(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE coffee_beans SET is_active = 0, updated_at = ? WHERE id = ?`,
    [now(), id]
  );
}

// 删除豆子（真删除）
export async function deleteBean(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM brew_logs WHERE bean_id = ?`, [id]);
  await db.runAsync(`DELETE FROM coffee_beans WHERE id = ?`, [id]);
}
