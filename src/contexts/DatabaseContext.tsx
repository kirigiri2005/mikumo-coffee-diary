import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { getDatabase } from '../database';

const DatabaseContext = createContext<SQLite.SQLiteDatabase | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    let mounted = true;
    getDatabase().then((database) => {
      if (mounted) setDb(database);
    });
    return () => { mounted = false; };
  }, []);

  if (!db) return null;
  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDB() {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDB 必须在 DatabaseProvider 内使用');
  return db;
}
