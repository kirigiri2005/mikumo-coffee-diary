import { getDatabase, now } from '../database';

export interface BrewLog {
  id: number;
  bean_id: number;
  bean_name: string;    // JOIN 来的
  dose_grams: number;
  brew_method: string | null;
  water_temp: number | null;
  grind_size: string | null;
  flavor_notes: string | null;
  brew_datetime: string;
  created_at: string;
  updated_at: string;
}

export interface BrewInput {
  bean_id: number;
  dose_grams: number;
  brew_method?: string;
  water_temp?: number;
  grind_size?: string;
  flavor_notes?: string;
  brew_datetime: string;
}

// 获取冲煮记录（分页），按时间倒序
export async function getBrewLogs(limit = 30, offset = 0): Promise<BrewLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BrewLog>(
    `SELECT b.*, c.name AS bean_name
     FROM brew_logs b
     LEFT JOIN coffee_beans c ON b.bean_id = c.id
     ORDER BY b.brew_datetime DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

// 获取单条记录
export async function getBrewLogById(id: number): Promise<BrewLog | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BrewLog>(
    `SELECT b.*, c.name AS bean_name
     FROM brew_logs b
     LEFT JOIN coffee_beans c ON b.bean_id = c.id
     WHERE b.id = ?`,
    [id]
  );
  return row ?? null;
}

// 获取某豆子剩余克数 — 实时计算
export async function getRemainingWeight(beanId: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ net_weight: number; used: number }>(
    `SELECT
       c.net_weight,
       COALESCE((SELECT SUM(b2.dose_grams) FROM brew_logs b2 WHERE b2.bean_id = c.id), 0) AS used
     FROM coffee_beans c WHERE c.id = ?`,
    [beanId]
  );
  if (!row) return 0;
  return row.net_weight - row.used;
}

// 在事务中插入冲煮记录（校验库存 + 插入）
export async function insertBrew(input: BrewInput): Promise<void> {
  const db = await getDatabase();

  // 事务：先查库存，再插入
  await db.withTransactionAsync(async () => {
    const remaining = await getRemainingWeight(input.bean_id);
    if (remaining < input.dose_grams) {
      throw new Error(`INSUFFICIENT:${remaining.toFixed(1)}`);
    }

    await db.runAsync(
      `INSERT INTO brew_logs (bean_id, dose_grams, brew_method, water_temp, grind_size, flavor_notes, brew_datetime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.bean_id,
        input.dose_grams,
        input.brew_method ?? null,
        input.water_temp ?? null,
        input.grind_size ?? null,
        input.flavor_notes ?? null,
        input.brew_datetime,
        now(),
        now(),
      ]
    );
  });
}

// 更新冲煮记录
export async function updateBrew(id: number, input: BrewInput): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    // 先查到旧记录的 dose，计算出"排除本次"后的剩余
    const old = await db.getFirstAsync<{ dose_grams: number; bean_id: number }>(
      'SELECT dose_grams, bean_id FROM brew_logs WHERE id = ?', [id]
    );
    if (!old) return;

    // 如果是同一个豆子，先排除旧的再校验新的
    const totalUsed = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(dose_grams), 0) AS total FROM brew_logs WHERE bean_id = ?',
      [old.bean_id]
    );
    const usedExcludingThis = (totalUsed?.total ?? 0) - old.dose_grams;

    // 获取豆子净含量
    const bean = await db.getFirstAsync<{ net_weight: number }>(
      'SELECT net_weight FROM coffee_beans WHERE id = ?', [old.bean_id]
    );
    const remainingExcludingThis = (bean?.net_weight ?? 0) - usedExcludingThis;

    if (remainingExcludingThis < input.dose_grams) {
      throw new Error(`INSUFFICIENT:${remainingExcludingThis.toFixed(1)}`);
    }

    await db.runAsync(
      `UPDATE brew_logs SET
         bean_id = ?, dose_grams = ?, brew_method = ?, water_temp = ?,
         grind_size = ?, flavor_notes = ?, brew_datetime = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.bean_id,
        input.dose_grams,
        input.brew_method ?? null,
        input.water_temp ?? null,
        input.grind_size ?? null,
        input.flavor_notes ?? null,
        input.brew_datetime,
        now(),
        id,
      ]
    );
  });
}

// 删除冲煮记录
export async function deleteBrew(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM brew_logs WHERE id = ?', [id]);
}

// 筛选查询（分页）
export async function getFilteredBrewLogs(
  limit = 30, offset = 0, beanId?: number, method?: string
): Promise<BrewLog[]> {
  const db = await getDatabase();
  let sql = `SELECT b.*, c.name AS bean_name FROM brew_logs b LEFT JOIN coffee_beans c ON b.bean_id = c.id WHERE 1=1`;
  const params: any[] = [];

  if (beanId) { sql += ' AND b.bean_id = ?'; params.push(beanId); }
  if (method) { sql += ' AND b.brew_method = ?'; params.push(method); }

  sql += ' ORDER BY b.brew_datetime DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.getAllAsync<BrewLog>(sql, params);
}

// 获取全部记录（导出用）
export async function getAllBrewLogsForExport(beanId?: number, method?: string): Promise<BrewLog[]> {
  const db = await getDatabase();
  let sql = `SELECT b.*, c.name AS bean_name FROM brew_logs b LEFT JOIN coffee_beans c ON b.bean_id = c.id WHERE 1=1`;
  const params: any[] = [];

  if (beanId) { sql += ' AND b.bean_id = ?'; params.push(beanId); }
  if (method) { sql += ' AND b.brew_method = ?'; params.push(method); }

  sql += ' ORDER BY b.brew_datetime DESC';
  return db.getAllAsync<BrewLog>(sql, params);
}

// 获取所有冲煮方式（去重）
export async function getDistinctMethods(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ brew_method: string }>(
    `SELECT DISTINCT brew_method FROM brew_logs WHERE brew_method IS NOT NULL AND brew_method != '' ORDER BY brew_method`
  );
  return rows.map((r) => r.brew_method);
}
