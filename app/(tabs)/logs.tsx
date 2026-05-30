import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  BrewLog, BrewInput, getFilteredBrewLogs, getAllBrewLogsForExport,
  insertBrew, updateBrew, deleteBrew, getBrewLogById, getDistinctMethods,
} from '../../src/db/brews';
import { CoffeeBean, getAllBeans } from '../../src/db/beans';
import dayjs from 'dayjs';

const DOSE_OPTIONS = [12, 15, 18, 20];
const METHOD_OPTIONS = ['手冲', '意式', '冷萃', '法压', '爱乐压', '虹吸'];
const GRIND_OPTIONS = ['极细', '细', '中细', '中', '中粗', '粗'];
const PAGE_SIZE = 30;

export default function LogsScreen() {
  const { colors } = useTheme();
  const [logs, setLogs] = useState<BrewLog[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BrewInput>(emptyBrewForm());
  const [beans, setBeans] = useState<CoffeeBean[]>([]);
  const [selectedBean, setSelectedBean] = useState<CoffeeBean | null>(null);
  const [showBeanPicker, setShowBeanPicker] = useState(false);
  const [showDateTime, setShowDateTime] = useState(false);

  // 筛选状态
  const [filterBeanId, setFilterBeanId] = useState<number | undefined>();
  const [filterMethod, setFilterMethod] = useState<string | undefined>();
  const [filterBeans, setFilterBeans] = useState<CoffeeBean[]>([]);
  const [filterMethods, setFilterMethods] = useState<string[]>([]);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const loadLogs = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offset;
    const data = await getFilteredBrewLogs(PAGE_SIZE, newOffset, filterBeanId, filterMethod);
    if (reset) {
      setLogs(data);
      setOffset(data.length);
    } else {
      setLogs((prev) => [...prev, ...data]);
      setOffset(newOffset + data.length);
    }
    setHasMore(data.length === PAGE_SIZE);
  }, [offset, filterBeanId, filterMethod]);

  useFocusEffect(useCallback(() => {
    loadLogs(true);
    // 加载筛选选项
    (async () => {
      const allBeans = await getAllBeans();
      setFilterBeans(allBeans);
      const methods = await getDistinctMethods();
      setFilterMethods(methods);
    })();
  }, [filterBeanId, filterMethod]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs(true);
    setRefreshing(false);
  };

  const loadMore = () => {
    if (hasMore) loadLogs(false);
  };

  // 清除筛选
  const clearFilter = () => {
    setFilterBeanId(undefined);
    setFilterMethod(undefined);
  };

  const hasFilter = filterBeanId || filterMethod;

  // 导出 CSV
  const handleExportCSV = async () => {
    try {
      const data = await getAllBrewLogsForExport(filterBeanId, filterMethod);
      if (data.length === 0) {
        Alert.alert('提示', '没有可导出的记录');
        return;
      }

      const header = '日期时间,咖啡豆,使用克数(g),冲煮方式,水温(℃),研磨度,风味笔记';
      const rows = data.map((r) =>
        [
          dayjs(r.brew_datetime).format('YYYY-MM-DD HH:mm'),
          `"${r.bean_name}"`,
          r.dose_grams,
          r.brew_method || '',
          r.water_temp || '',
          r.grind_size || '',
          `"${(r.flavor_notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
      const csv = '﻿' + header + '\n' + rows.join('\n');
      const fileName = `mikumo_brews_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: '导出冲煮记录',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('提示', '当前设备不支持分享');
      }
    } catch (e: any) {
      Alert.alert('导出失败', e.message || '未知错误');
    }
  };

  // 打开添加表单
  const openAdd = async () => {
    const allBeans = await getAllBeans();
    const available = allBeans.filter((b) => b.remaining_weight > 0);
    setBeans(available);
    if (available.length === 0) {
      Alert.alert('提示', '请先添加有库存的咖啡豆');
      return;
    }
    setEditingId(null);
    setForm(emptyBrewForm());
    setSelectedBean(available[0]);
    setForm((f) => ({ ...f, bean_id: available[0].id }));
    setModalVisible(true);
  };

  const openEdit = async (logId: number) => {
    const log = await getBrewLogById(logId);
    if (!log) return;
    const allBeans = await getAllBeans();
    const available = allBeans.filter((b) => b.is_active === 1);
    setBeans(available);
    setEditingId(logId);
    setForm({
      bean_id: log.bean_id,
      dose_grams: log.dose_grams,
      brew_method: log.brew_method ?? undefined,
      water_temp: log.water_temp ?? undefined,
      grind_size: log.grind_size ?? undefined,
      flavor_notes: log.flavor_notes ?? undefined,
      brew_datetime: log.brew_datetime,
    });
    setSelectedBean(available.find((b) => b.id === log.bean_id) ?? null);
    setModalVisible(true);
  };

  const selectBean = (bean: CoffeeBean) => {
    setSelectedBean(bean);
    setForm({ ...form, bean_id: bean.id });
    setShowBeanPicker(false);
  };

  const handleSave = async () => {
    if (!form.bean_id) { Alert.alert('提示', '请选择咖啡豆'); return; }
    if (!form.dose_grams || form.dose_grams <= 0) { Alert.alert('提示', '请填写使用克数'); return; }
    if (!form.brew_datetime) { Alert.alert('提示', '请选择日期时间'); return; }

    try {
      if (editingId) {
        await updateBrew(editingId, form);
      } else {
        await insertBrew(form);
      }
      setModalVisible(false);
      await loadLogs(true);
    } catch (e: any) {
      if (e.message?.startsWith('INSUFFICIENT:')) {
        const rem = e.message.split(':')[1];
        Alert.alert('库存不足', `该豆子剩余仅 ${rem}g，无法冲煮`);
      } else {
        Alert.alert('错误', '保存失败，请重试');
      }
    }
  };

  const confirmDelete = (log: BrewLog) => {
    Alert.alert('删除记录', '确定删除这条冲煮记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => { await deleteBrew(log.id); await loadLogs(true); },
      },
    ]);
  };

  const renderItem = ({ item }: { item: BrewLog }) => (
    <TouchableOpacity
      style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => openEdit(item.id)}
      onLongPress={() => confirmDelete(item)}
      activeOpacity={0.7}
    >
      <View style={styles.logHeader}>
        <Text style={[styles.logDate, { color: colors.primary }]}>
          {dayjs(item.brew_datetime).format('MM-DD HH:mm')}
        </Text>
        <Text style={[styles.logDose, { color: colors.text }]}>
          {item.dose_grams}g
        </Text>
      </View>
      <View style={styles.logBody}>
        <Text style={[styles.logBean, { color: colors.text }]} numberOfLines={1}>
          {item.bean_name}
        </Text>
        <View style={styles.logMeta}>
          {item.brew_method && (
            <View style={[styles.logTag, { backgroundColor: colors.surface }]}>
              <Text style={[styles.logTagText, { color: colors.textSecondary }]}>
                {item.brew_method}
              </Text>
            </View>
          )}
          {item.grind_size && (
            <View style={[styles.logTag, { backgroundColor: colors.surface }]}>
              <Text style={[styles.logTagText, { color: colors.textSecondary }]}>
                {item.grind_size}
              </Text>
            </View>
          )}
          {item.water_temp && (
            <Text style={[styles.logTemp, { color: colors.textSecondary }]}>
              {item.water_temp}°C
            </Text>
          )}
        </View>
        {item.flavor_notes ? (
          <Text style={[styles.logNotes, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.flavor_notes}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部工具栏 */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.toolBtn, showFilterBar && { backgroundColor: colors.surface }]}
          onPress={() => setShowFilterBar(!showFilterBar)}
        >
          <Ionicons name="filter-outline" size={18} color={hasFilter ? colors.primary : colors.textSecondary} />
          <Text style={[styles.toolBtnText, { color: hasFilter ? colors.primary : colors.textSecondary }]}>
            筛选{hasFilter ? ' (已启用)' : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={handleExportCSV}>
          <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.toolBtnText, { color: colors.textSecondary }]}>导出</Text>
        </TouchableOpacity>
      </View>

      {/* 筛选栏 */}
      {showFilterBar && (
        <View style={[styles.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>豆子:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterChip, !filterBeanId && styles.filterChipActive,
                { borderColor: colors.border }, !filterBeanId && { backgroundColor: colors.primary }]}
              onPress={() => setFilterBeanId(undefined)}
            >
              <Text style={{ fontSize: 12, color: filterBeanId ? colors.text : '#FFF' }}>全部</Text>
            </TouchableOpacity>
            {filterBeans.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.filterChip, filterBeanId === b.id && styles.filterChipActive,
                  { borderColor: colors.border }, filterBeanId === b.id && { backgroundColor: colors.primary }]}
                onPress={() => setFilterBeanId(filterBeanId === b.id ? undefined : b.id)}
              >
                <Text style={{ fontSize: 12, color: filterBeanId === b.id ? '#FFF' : colors.text }}>
                  {b.name.length > 6 ? b.name.slice(0, 6) + '…' : b.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: colors.textSecondary, marginTop: 6 }]}>方式:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterChip, !filterMethod && styles.filterChipActive,
                { borderColor: colors.border }, !filterMethod && { backgroundColor: colors.primary }]}
              onPress={() => setFilterMethod(undefined)}
            >
              <Text style={{ fontSize: 12, color: filterMethod ? colors.text : '#FFF' }}>全部</Text>
            </TouchableOpacity>
            {filterMethods.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.filterChip, filterMethod === m && styles.filterChipActive,
                  { borderColor: colors.border }, filterMethod === m && { backgroundColor: colors.primary }]}
                onPress={() => setFilterMethod(filterMethod === m ? undefined : m)}
              >
                <Text style={{ fontSize: 12, color: filterMethod === m ? '#FFF' : colors.text }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {hasFilter && (
            <TouchableOpacity onPress={clearFilter} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: colors.primary }}>清除筛选</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 列表 */}
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cafe-outline" size={64} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {hasFilter ? '没有匹配的记录' : '还没有冲煮记录，点击右下角 + 开始记录'}
            </Text>
          </View>
        }
      />

      {/* 悬浮添加按钮 */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openAdd}
        activeOpacity={0.8}
      >
        <Text style={{ color: '#FFF', fontSize: 28, lineHeight: 30, fontWeight: '300' }}>+</Text>
      </TouchableOpacity>

      {/* 添加/编辑 Modal */}
      <BrewFormModal
        visible={modalVisible}
        form={form}
        setForm={setForm}
        editingId={editingId}
        beans={beans}
        selectedBean={selectedBean}
        showBeanPicker={showBeanPicker}
        setShowBeanPicker={setShowBeanPicker}
        onSelectBean={selectBean}
        showDateTime={showDateTime}
        setShowDateTime={setShowDateTime}
        colors={colors}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

// ---- 表单 Modal（同 V0.3.0 不变）----

function BrewFormModal({
  visible, form, setForm, editingId, beans, selectedBean,
  showBeanPicker, setShowBeanPicker, onSelectBean,
  showDateTime, setShowDateTime, colors, onSave, onClose,
}: any) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {editingId ? '编辑冲煮' : '添加冲煮'}
          </Text>
          <TouchableOpacity onPress={onSave}>
            <Text style={[styles.modalSave, { color: colors.primary }]}>保存</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formBody}>
          {/* 咖啡豆 */}
          <FormLabel color={colors.text}>咖啡豆 *</FormLabel>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowBeanPicker(!showBeanPicker)}
          >
            <Text style={{ color: colors.text, flex: 1 }}>
              {selectedBean
                ? `${selectedBean.name} (剩 ${selectedBean.remaining_weight.toFixed(1)}g)`
                : '选择咖啡豆'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showBeanPicker && (
            <View style={[styles.pickerList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {beans.map((b: CoffeeBean) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.pickerItem, { borderBottomColor: colors.border },
                    b.id === selectedBean?.id && { backgroundColor: colors.surface }]}
                  onPress={() => onSelectBean(b)}
                >
                  <Text style={{ color: colors.text }}>
                    {b.name} (剩 {b.remaining_weight.toFixed(1)}g)
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 使用克数 */}
          <FormLabel color={colors.text}>使用克数 *</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.dose_grams ? form.dose_grams.toString() : ''}
            onChangeText={(t) => setForm({ ...form, dose_grams: parseFloat(t) || 0 })}
            placeholder="手动输入"
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {DOSE_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.quickBtn, {
                  backgroundColor: form.dose_grams === d ? colors.primary : colors.card,
                  borderColor: colors.border,
                }]}
                onPress={() => setForm({ ...form, dose_grams: d })}
              >
                <Text style={[styles.quickBtnText, { color: form.dose_grams === d ? '#FFF' : colors.text }]}>
                  {d}g
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 冲煮方式 */}
          <FormLabel color={colors.text}>冲煮方式</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.brew_method ?? ''}
            onChangeText={(t) => setForm({ ...form, brew_method: t })}
            placeholder="自由输入或点下方快捷选项"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {METHOD_OPTIONS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.quickBtn, {
                  backgroundColor: form.brew_method === m ? colors.primary : colors.card,
                  borderColor: colors.border,
                }]}
                onPress={() => setForm({ ...form, brew_method: m })}
              >
                <Text style={[styles.quickBtnText, { color: form.brew_method === m ? '#FFF' : colors.text }]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 研磨度 */}
          <FormLabel color={colors.text}>研磨度</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.grind_size ?? ''}
            onChangeText={(t) => setForm({ ...form, grind_size: t })}
            placeholder="自由输入或点下方快捷选项"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {GRIND_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.quickBtn, {
                  backgroundColor: form.grind_size === g ? colors.primary : colors.card,
                  borderColor: colors.border,
                }]}
                onPress={() => setForm({ ...form, grind_size: g })}
              >
                <Text style={[styles.quickBtnText, { color: form.grind_size === g ? '#FFF' : colors.text }]}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 水温 */}
          <FormLabel color={colors.text}>水温 (°C)</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.water_temp ? form.water_temp.toString() : ''}
            onChangeText={(t) => setForm({ ...form, water_temp: parseFloat(t) || undefined })}
            placeholder="例: 92"
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />

          {/* 风味笔记 */}
          <FormLabel color={colors.text}>风味笔记</FormLabel>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.flavor_notes ?? ''}
            onChangeText={(t) => setForm({ ...form, flavor_notes: t })}
            placeholder="今天这杯感觉怎么样..."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholderTextColor={colors.textSecondary}
          />

          {/* 日期时间 */}
          <FormLabel color={colors.text}>日期时间 *</FormLabel>
          <TouchableOpacity
            style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowDateTime(true)}
          >
            <Text style={{ color: colors.text }}>
              {dayjs(form.brew_datetime).format('YYYY-MM-DD HH:mm')}
            </Text>
          </TouchableOpacity>
          {showDateTime && (
            <DateTimePicker
              value={dayjs(form.brew_datetime).toDate()}
              mode="datetime"
              onChange={(_, d) => {
                setShowDateTime(false);
                if (d) setForm({ ...form, brew_datetime: d.toISOString() });
              }}
            />
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}

// ---- 工具 ----

function emptyBrewForm(): BrewInput {
  return { bean_id: 0, dose_grams: 15, brew_datetime: dayjs().toISOString() };
}

function FormLabel({ color, children }: { color: string; children: string }) {
  return <Text style={[styles.label, { color }]}>{children}</Text>;
}

// ---- 样式 ----

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  toolBtnText: { fontSize: 13 },
  filterBar: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, marginRight: 6,
  },
  filterChipActive: { borderWidth: 0 },
  listContent: { padding: 16, paddingBottom: 80 },
  logCard: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10,
  },
  logHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  logDate: { fontSize: 14, fontWeight: '600' },
  logDose: { fontSize: 16, fontWeight: '700' },
  logBody: {},
  logBean: { fontSize: 15, fontWeight: '500', marginBottom: 6 },
  logMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  logTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  logTagText: { fontSize: 12 },
  logTemp: { fontSize: 12, paddingHorizontal: 4 },
  logNotes: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 15, marginTop: 12 },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalSave: { fontSize: 16, fontWeight: '600' },
  formBody: { padding: 16 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 14 },
  input: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  textArea: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    minHeight: 80,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16, borderWidth: 1,
  },
  quickBtnText: { fontSize: 13 },
  selector: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  pickerList: {
    borderRadius: 8, borderWidth: 1, marginTop: 4, maxHeight: 200,
  },
  pickerItem: {
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
