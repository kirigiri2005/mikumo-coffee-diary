import { getDatabase } from '../database';

// 饼图：各豆子累计消耗
export interface BeanConsumption {
  bean_name: string;
  total_grams: number;
}

export async function getBeanConsumption(): Promise<BeanConsumption[]> {
  const db = await getDatabase();
  return db.getAllAsync<BeanConsumption>(`
    SELECT c.name AS bean_name, COALESCE(SUM(b.dose_grams), 0) AS total_grams
    FROM brew_logs b
    JOIN coffee_beans c ON b.bean_id = c.id
    GROUP BY b.bean_id
    ORDER BY total_grams DESC
  `);
}

// 折线图：近 30 天每日消耗
export interface DailyConsumption {
  date: string;
  total_grams: number;
}

export async function getDailyConsumption(days = 30): Promise<DailyConsumption[]> {
  const db = await getDatabase();
  return db.getAllAsync<DailyConsumption>(`
    SELECT date(b.brew_datetime) AS date, SUM(b.dose_grams) AS total_grams
    FROM brew_logs b
    WHERE b.brew_datetime >= date('now', 'localtime', '-${days} days')
    GROUP BY date(b.brew_datetime)
    ORDER BY date ASC
  `);
}

// 柱状图：各冲煮方式次数
export interface MethodCount {
  brew_method: string;
  count: number;
}

export async function getMethodCounts(): Promise<MethodCount[]> {
  const db = await getDatabase();
  return db.getAllAsync<MethodCount>(`
    SELECT brew_method, COUNT(*) AS count
    FROM brew_logs
    WHERE brew_method IS NOT NULL AND brew_method != ''
    GROUP BY brew_method
    ORDER BY count DESC
  `);
}
