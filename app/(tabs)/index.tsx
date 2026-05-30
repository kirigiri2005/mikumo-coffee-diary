import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, ScrollView, StyleSheet,
  Switch, RefreshControl, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  CoffeeBean, BeanInput, getAllBeans, getAllBeansIncludingInactive,
  insertBean, updateBean, deleteBean, deactivateBean, getBeanById,
} from '../../src/db/beans';
import dayjs from 'dayjs';

// 烘焙度快捷选项
const ROAST_OPTIONS = ['浅', '浅中', '中', '中深', '深'];

export default function InventoryScreen() {
  const { colors } = useTheme();
  const [beans, setBeans] = useState<CoffeeBean[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BeanInput>(emptyForm());
  const [showRoastDate, setShowPurchaseDate] = useState(false);
  const [showOpenDate, setShowOpenDate] = useState(false);

  const loadBeans = useCallback(async () => {
    const data = showInactive
      ? await getAllBeansIncludingInactive()
      : await getAllBeans();
    setBeans(data);
  }, [showInactive]);

  // 每次页面获得焦点时刷新
  useFocusEffect(useCallback(() => {
    loadBeans();
  }, [loadBeans]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBeans();
    setRefreshing(false);
  };

  // 打开添加表单
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalVisible(true);
  };

  // 打开编辑表单
  const openEdit = async (id: number) => {
    const bean = await getBeanById(id);
    if (!bean) return;
    setEditingId(id);
    setForm({
      name: bean.name,
      country: bean.country ?? undefined,
      region: bean.region ?? undefined,
      farm: bean.farm ?? undefined,
      variety: bean.variety ?? undefined,
      process_method: bean.process_method ?? undefined,
      roast_level: bean.roast_level ?? undefined,
      flavor: bean.flavor ?? undefined,
      net_weight: bean.net_weight,
      total_price: bean.total_price,
      roast_date: bean.roast_date,
      open_date: bean.open_date ?? undefined,
      best_days: bean.best_days ?? undefined,
    });
    setModalVisible(true);
  };

  // 保存（添加或更新）
  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('提示', '请填写咖啡豆名称');
      return;
    }
    if (!form.net_weight || form.net_weight <= 0) {
      Alert.alert('提示', '请填写正确的净含量');
      return;
    }
    if (!form.total_price || form.total_price < 0) {
      Alert.alert('提示', '请填写正确的总价');
      return;
    }

    if (editingId) {
      await updateBean(editingId, form);
    } else {
      await insertBean(form);
    }
    setModalVisible(false);
    await loadBeans();
  };

  // 删除确认
  const confirmDelete = (bean: CoffeeBean) => {
    Alert.alert(
      '删除咖啡豆',
      `确定删除「${bean.name}」吗？关联的冲煮记录也会一并删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除', style: 'destructive',
          onPress: async () => {
            await deleteBean(bean.id);
            await loadBeans();
          },
        },
      ]
    );
  };

  // 标记用完
  const handleUseUp = (bean: CoffeeBean) => {
    Alert.alert(
      '标记用完',
      `确定将「${bean.name}」标记为已用完吗？之后可在"显示已用完"中查看。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: async () => { await deactivateBean(bean.id); await loadBeans(); } },
      ]
    );
  };

  // 重新激活
  const handleReactivate = async (id: number) => {
    const db = (await import('../../src/database')).getDatabase;
    const database = await db();
    const now = (await import('../../src/database')).now;
    await database.runAsync(
      'UPDATE coffee_beans SET is_active = 1, updated_at = ? WHERE id = ?',
      [now(), id]
    );
    await loadBeans();
  };

  const cardBg = colors.card;
  const borderColor = colors.border;

  // 计算赏味期
  const getBestDaysInfo = (bean: CoffeeBean) => {
    if (!bean.best_days || !bean.open_date) return null;
    const opened = dayjs(bean.open_date);
    const deadline = opened.add(bean.best_days, 'day');
    const today = dayjs();
    if (today.isAfter(deadline)) {
      const passed = today.diff(deadline, 'day');
      return { text: `已过赏味期 ${passed} 天`, overdue: true };
    }
    const left = deadline.diff(today, 'day');
    return { text: `赏味期剩 ${left} 天`, overdue: false };
  };

  const renderCard = ({ item }: { item: CoffeeBean }) => {
    const bestInfo = getBestDaysInfo(item);
    const isLowStock = item.remaining_weight > 0 && item.remaining_weight <= 30;
    const isFinished = item.remaining_weight <= 0;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => {
          Alert.alert(item.name, '选择操作', [
            { text: '编辑', onPress: () => openEdit(item.id) },
            { text: '删除', style: 'destructive', onPress: () => confirmDelete(item) },
            ...(isFinished ? [{ text: '重新激活', onPress: () => handleReactivate(item.id) }] : []),
            ...(!isFinished ? [{ text: '标记用完', onPress: () => handleUseUp(item) }] : []),
            { text: '取消', style: 'cancel' },
          ]);
        }}
        style={[styles.card, { backgroundColor: cardBg, borderColor }]}
      >
        {/* 头部：名称 + 状态标签 */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.beanName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.flavor ? (
              <Text style={[styles.flavor, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.flavor}
              </Text>
            ) : null}
          </View>
          <View style={styles.badges}>
            {isFinished && (
              <View style={[styles.badge, { backgroundColor: colors.border }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>已用完</Text>
              </View>
            )}
            {isLowStock && !isFinished && (
              <View style={[styles.badge, { backgroundColor: '#FFF3E0' }]}>
                <Text style={[styles.badgeText, { color: colors.warning }]}>低库存</Text>
              </View>
            )}
            {bestInfo?.overdue && (
              <View style={[styles.badge, { backgroundColor: '#FFEBEE' }]}>
                <Text style={[styles.badgeText, { color: colors.error }]}>{bestInfo.text}</Text>
              </View>
            )}
            {bestInfo && !bestInfo.overdue && (
              <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>{bestInfo.text}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 分隔线 */}
        <View style={[styles.divider, { backgroundColor: borderColor }]} />

        {/* 详情行 */}
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>剩余 / 总重</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {item.remaining_weight.toFixed(1)}g / {item.net_weight}g
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>克价</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                ¥{parseFloat(item.unit_price).toFixed(4)}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>剩余价值</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                ¥{item.remaining_value.toFixed(2)}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>烘焙度</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {item.roast_level || '-'}
              </Text>
            </View>
          </View>
          {/* 产地信息 & 豆种/处理法 */}
          {(item.country || item.region || item.farm || item.variety || item.process_method) ? (
            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {[item.country, item.region, item.farm].filter(Boolean).join(' · ') || '产地'}
                </Text>
                <Text style={[styles.infoDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.variety, item.process_method].filter(Boolean).join(' / ') || '-'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部操作栏 */}
      <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>显示已用完</Text>
          <Switch
            value={showInactive}
            onValueChange={(v) => setShowInactive(v)}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={showInactive ? colors.primary : '#f4f3f4'}
          />
        </View>
      </View>

      {/* 豆子列表 */}
      <FlatList
        data={beans}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          // 库存总览
          <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {beans.filter((b) => b.is_active === 1).reduce((s, b) => s + b.remaining_weight, 0).toFixed(1)}g
              </Text>
              <Text style={styles.summaryLabel}>总剩余克数</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                ¥{beans.filter((b) => b.is_active === 1).reduce((s, b) => s + b.remaining_value, 0).toFixed(2)}
              </Text>
              <Text style={styles.summaryLabel}>总剩余价值</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="nutrition-outline" size={64} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              还没有咖啡豆，点击右下角 + 添加
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
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* 添加/编辑 Modal */}
      <BeanFormModal
        visible={modalVisible}
        form={form}
        setForm={setForm}
        editingId={editingId}
        colors={colors}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
        showRoastDate={showRoastDate}
        setShowPurchaseDate={setShowPurchaseDate}
        showOpenDate={showOpenDate}
        setShowOpenDate={setShowOpenDate}
      />
    </View>
  );
}

// ---- 表单 Modal ----

function BeanFormModal({
  visible, form, setForm, editingId, colors,
  onSave, onClose, showRoastDate, setShowPurchaseDate,
  showOpenDate, setShowOpenDate,
}: {
  visible: boolean;
  form: BeanInput;
  setForm: React.Dispatch<React.SetStateAction<BeanInput>>;
  editingId: number | null;
  colors: any;
  onSave: () => void;
  onClose: () => void;
  showRoastDate: boolean;
  setShowPurchaseDate: (v: boolean) => void;
  showOpenDate: boolean;
  setShowOpenDate: (v: boolean) => void;
}) {
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
            {editingId ? '编辑咖啡豆' : '添加咖啡豆'}
          </Text>
          <TouchableOpacity onPress={onSave}>
            <Text style={[styles.modalSave, { color: colors.primary }]}>保存</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formBody}>
          {/* 名称 */}
          <FormLabel color={colors.text}>名称 *</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.name}
            onChangeText={(t) => setForm({ ...form, name: t })}
            placeholder="例: 埃塞 耶加雪菲"
            placeholderTextColor={colors.textSecondary}
          />

          {/* 产国 */}
          <FormLabel color={colors.text}>产国</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.country}
            onChangeText={(t) => setForm({ ...form, country: t })}
            placeholder="例: 埃塞俄比亚"
            placeholderTextColor={colors.textSecondary}
          />

          {/* 产区 + 庄园 同行 */}
          <View style={styles.row2}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <FormLabel color={colors.text}>产区</FormLabel>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={form.region}
                onChangeText={(t) => setForm({ ...form, region: t })}
                placeholder="例: 古吉"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel color={colors.text}>庄园</FormLabel>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={form.farm}
                onChangeText={(t) => setForm({ ...form, farm: t })}
                placeholder="例: 罕贝拉"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* 豆种 */}
          <FormLabel color={colors.text}>豆种</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.variety}
            onChangeText={(t) => setForm({ ...form, variety: t })}
            placeholder="例: 瑰夏"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {['阿拉比卡', '罗布斯塔', '瑰夏', '铁皮卡', '波旁', '卡杜拉'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.quickBtn, { backgroundColor: form.variety === opt ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setForm({ ...form, variety: form.variety === opt ? undefined : opt })}
              >
                <Text style={[styles.quickBtnText, { color: form.variety === opt ? '#FFF' : colors.text }]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 处理法 */}
          <FormLabel color={colors.text}>处理法</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.process_method}
            onChangeText={(t) => setForm({ ...form, process_method: t })}
            placeholder="例: 日晒"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {['日晒', '水洗', '蜜处理', '厌氧', '半水洗'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.quickBtn, { backgroundColor: form.process_method === opt ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setForm({ ...form, process_method: form.process_method === opt ? undefined : opt })}
              >
                <Text style={[styles.quickBtnText, { color: form.process_method === opt ? '#FFF' : colors.text }]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 风味 */}
          <FormLabel color={colors.text}>风味</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.flavor}
            onChangeText={(t) => setForm({ ...form, flavor: t })}
            placeholder="例: 花香、柑橘、蜂蜜"
            placeholderTextColor={colors.textSecondary}
          />

          {/* 烘焙度 */}
          <FormLabel color={colors.text}>烘焙度</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.roast_level}
            onChangeText={(t) => setForm({ ...form, roast_level: t })}
            placeholder="自由输入或点下方快捷选项"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.quickRow}>
            {ROAST_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.quickBtn,
                  {
                    backgroundColor: form.roast_level === opt ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setForm({ ...form, roast_level: opt })}
              >
                <Text
                  style={[
                    styles.quickBtnText,
                    { color: form.roast_level === opt ? '#FFF' : colors.text },
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 净含量 + 总价 */}
          <View style={styles.row2}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <FormLabel color={colors.text}>净含量 (克) *</FormLabel>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={form.net_weight ? form.net_weight.toString() : ''}
                onChangeText={(t) => setForm({ ...form, net_weight: parseFloat(t) || 0 })}
                placeholder="250"
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel color={colors.text}>总价 (元) *</FormLabel>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={form.total_price ? form.total_price.toString() : ''}
                onChangeText={(t) => setForm({ ...form, total_price: parseFloat(t) || 0 })}
                placeholder="99"
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* 克价预览 */}
          {form.net_weight > 0 && form.total_price >= 0 && (
            <Text style={[styles.pricePreview, { color: colors.primary }]}>
              克价: ¥{(form.total_price / form.net_weight).toFixed(4)} / 克
            </Text>
          )}

          {/* 烘焙日期（生产日期） */}
          <FormLabel color={colors.text}>烘焙日期 *</FormLabel>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowPurchaseDate(true)}
          >
            <Text style={{ color: colors.text }}>
              {form.roast_date ? dayjs(form.roast_date).format('YYYY-MM-DD') : '选择日期'}
            </Text>
          </TouchableOpacity>
          {showRoastDate && (
            <DateTimePicker
              value={form.roast_date ? dayjs(form.roast_date).toDate() : new Date()}
              mode="date"
              onChange={(_, d) => {
                setShowPurchaseDate(false);
                if (d) setForm({ ...form, roast_date: d.toISOString() });
              }}
            />
          )}

          {/* 开封日期 */}
          <FormLabel color={colors.text}>开封日期</FormLabel>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowOpenDate(true)}
          >
            <Text style={{ color: form.open_date ? colors.text : colors.textSecondary }}>
              {form.open_date ? dayjs(form.open_date).format('YYYY-MM-DD') : '未开封（点击选择）'}
            </Text>
          </TouchableOpacity>
          {showOpenDate && (
            <DateTimePicker
              value={form.open_date ? dayjs(form.open_date).toDate() : new Date()}
              mode="date"
              onChange={(_, d) => {
                setShowOpenDate(false);
                if (d) setForm({ ...form, open_date: d.toISOString() });
              }}
            />
          )}

          {/* 赏味天数 */}
          <FormLabel color={colors.text}>最佳赏味天数</FormLabel>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={form.best_days ? form.best_days.toString() : ''}
            onChangeText={(t) => setForm({ ...form, best_days: parseInt(t) || undefined })}
            placeholder="例: 30"
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}

// ---- 工具函数 ----

function emptyForm(): BeanInput {
  return {
    name: '',
    net_weight: 0,
    total_price: 0,
    roast_date: dayjs().toISOString(),
  };
}

function FormLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text style={[styles.label, { color }]}>{children}</Text>
  );
}

// ---- 样式 ----

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  toggleLabel: { fontSize: 14 },
  // 总览卡片
  summaryCard: {
    flexDirection: 'row', borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 10, marginBottom: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  summaryDivider: { width: 1, alignSelf: 'stretch' },
  listContent: { padding: 16, paddingBottom: 80 },
  card: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12, padding: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  beanName: { fontSize: 17, fontWeight: '600', marginBottom: 2 },
  flavor: { fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: 8 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    marginBottom: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  cardBody: {},
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoItem: { flex: 1 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '500' },
  infoDetail: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 15, marginTop: 12 },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  // Modal
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
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16, borderWidth: 1,
  },
  quickBtnText: { fontSize: 13 },
  row2: { flexDirection: 'row', marginTop: 4 },
  pricePreview: { fontSize: 14, fontWeight: '500', marginTop: 10, textAlign: 'right' },
  dateBtn: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 12,
  },
});
