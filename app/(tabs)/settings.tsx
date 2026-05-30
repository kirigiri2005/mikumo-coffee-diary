import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getDatabase } from '../../src/database';
import dayjs from 'dayjs';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // 导出数据
  const handleExport = async () => {
    setExporting(true);
    try {
      const db = await getDatabase();

      // 读取全部数据
      const beans = await db.getAllAsync('SELECT * FROM coffee_beans ORDER BY id');
      const brews = await db.getAllAsync('SELECT * FROM brew_logs ORDER BY id');

      const backup = {
        version: '1.0.0',
        app: 'mikumo的咖啡日记',
        exported_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        coffee_beans: beans,
        brew_logs: brews,
      };

      const fileName = `mikumo_backup_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backup, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: '导出备份',
          UTI: 'public.json',
        });
        Alert.alert('导出成功', `已生成备份文件：${fileName}`);
      } else {
        Alert.alert('提示', '当前设备不支持分享功能');
      }
    } catch (e: any) {
      Alert.alert('导出失败', e.message || '未知错误');
    } finally {
      setExporting(false);
    }
  };

  // 导入数据
  const handleImport = async () => {
    Alert.alert(
      '导入备份',
      '导入将替换当前所有数据。\n\n导入前会自动备份当前数据到文件，确保不丢失。\n\n确定要导入吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '选择文件导入',
          onPress: async () => {
            setImporting(true);
            try {
              // 使用 expo-document-picker 选择文件
              const DocumentPicker = require('expo-document-picker');
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });

              if (result.canceled) { setImporting(false); return; }

              const fileUri = result.assets[0].uri;
              const content = await FileSystem.readAsStringAsync(fileUri, {
                encoding: FileSystem.EncodingType.UTF8,
              });

              let data: any;
              try {
                data = JSON.parse(content);
              } catch {
                Alert.alert('格式错误', '所选文件不是有效的 JSON 备份文件');
                setImporting(false);
                return;
              }

              if (!data.coffee_beans || !data.brew_logs) {
                Alert.alert('格式错误', '备份文件格式不正确，缺少必要数据');
                setImporting(false);
                return;
              }

              // 先导出当前数据作为安全备份
              const db = await getDatabase();
              const currentBeans = await db.getAllAsync('SELECT * FROM coffee_beans');
              const currentBrews = await db.getAllAsync('SELECT * FROM brew_logs');
              const safetyBackup = {
                version: '1.0.0',
                app: 'mikumo的咖啡日记',
                exported_at: `导入前自动备份 ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
                coffee_beans: currentBeans,
                brew_logs: currentBrews,
              };
              const safetyFileName = `mikumo_autobackup_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
              const safetyPath = `${FileSystem.cacheDirectory}${safetyFileName}`;
              await FileSystem.writeAsStringAsync(safetyPath, JSON.stringify(safetyBackup, null, 2), {
                encoding: FileSystem.EncodingType.UTF8,
              });

              // 在事务中替换全部数据
              await db.withTransactionAsync(async () => {
                await db.execAsync('DELETE FROM brew_logs');
                await db.execAsync('DELETE FROM coffee_beans');

                for (const bean of data.coffee_beans) {
                  await db.runAsync(
                    `INSERT INTO coffee_beans (id, name, origin, roast_level, flavor, net_weight, total_price, unit_price, purchase_date, open_date, best_days, is_active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      bean.id, bean.name, bean.origin ?? null, bean.roast_level ?? null,
                      bean.flavor ?? null, bean.net_weight, bean.total_price, bean.unit_price,
                      bean.purchase_date, bean.open_date ?? null, bean.best_days ?? null,
                      bean.is_active ?? 1, bean.created_at ?? dayjs().toISOString(),
                      bean.updated_at ?? dayjs().toISOString(),
                    ]
                  );
                }

                for (const brew of data.brew_logs) {
                  await db.runAsync(
                    `INSERT INTO brew_logs (id, bean_id, dose_grams, brew_method, water_temp, grind_size, flavor_notes, brew_datetime, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      brew.id, brew.bean_id, brew.dose_grams, brew.brew_method ?? null,
                      brew.water_temp ?? null, brew.grind_size ?? null,
                      brew.flavor_notes ?? null, brew.brew_datetime,
                      brew.created_at ?? dayjs().toISOString(),
                      brew.updated_at ?? dayjs().toISOString(),
                    ]
                  );
                }
              });

              // 分享自动备份文件
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(safetyPath, {
                  mimeType: 'application/json',
                  dialogTitle: '保存自动备份',
                  UTI: 'public.json',
                });
              }

              Alert.alert('导入成功', `数据已恢复。\n导入前数据已自动备份为：${safetyFileName}`);
            } catch (e: any) {
              Alert.alert('导入失败', e.message || '未知错误');
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 数据备份 */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>数据管理</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={handleExport}
          disabled={exporting}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="cloud-download-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>导出备份</Text>
            <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>
              将所有数据导出为 JSON 文件并分享
            </Text>
          </View>
          {exporting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={handleImport}
          disabled={importing}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>导入恢复</Text>
            <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>
              从 JSON 备份文件恢复数据（导入前自动备份当前数据）
            </Text>
          </View>
          {importing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* 关于 */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>关于</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>mikumo的咖啡日记</Text>
            <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>版本 0.5.0</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600',
    marginTop: 16, marginBottom: 8, marginLeft: 16,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 36, alignItems: 'center', marginRight: 8 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowDesc: { fontSize: 13, marginTop: 2 },
});
