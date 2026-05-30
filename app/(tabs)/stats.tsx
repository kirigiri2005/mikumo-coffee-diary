import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Dimensions, RefreshControl,
} from 'react-native';
import { PieChart, LineChart, BarChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ChartColors } from '../../src/theme';
import { getBeanConsumption, getDailyConsumption, getMethodCounts, BeanConsumption, DailyConsumption, MethodCount } from '../../src/db/stats';
import dayjs from 'dayjs';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 32;

export default function StatsScreen() {
  const { colors } = useTheme();
  const [beanData, setBeanData] = useState<BeanConsumption[]>([]);
  const [dailyData, setDailyData] = useState<DailyConsumption[]>([]);
  const [methodData, setMethodData] = useState<MethodCount[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    const [beans, daily, methods] = await Promise.all([
      getBeanConsumption(),
      getDailyConsumption(30),
      getMethodCounts(),
    ]);
    setBeanData(beans);
    setDailyData(daily);
    setMethodData(methods);
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  // 饼图数据
  const hasConsumption = beanData.length > 0 && beanData.some((b) => b.total_grams > 0);
  const pieData = beanData
    .filter((b) => b.total_grams > 0)
    .map((b, i) => ({
      name: b.bean_name.length > 6 ? b.bean_name.slice(0, 6) + '…' : b.bean_name,
      population: Math.round(b.total_grams),
      color: ChartColors[i % ChartColors.length],
      legendFontColor: colors.textSecondary,
      legendFontSize: 12,
    }));

  // 折线图数据
  const hasDaily = dailyData.length > 0;
  const lineLabels = dailyData.map((d) => dayjs(d.date).format('MM/DD'));
  const lineValues = dailyData.map((d) => d.total_grams);

  // 柱状图数据
  const hasMethods = methodData.length > 0;
  const barLabels = methodData.map((m) => m.brew_method.length > 3 ? m.brew_method.slice(0, 3) : m.brew_method);
  const barValues = methodData.map((m) => m.count);

  // 图表通用配置
  const chartConfig = {
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalCount: 0,
    color: (opacity = 1) => `rgba(139, 94, 60, ${opacity})`,
    labelColor: () => colors.textSecondary,
    style: { borderRadius: 12 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primary },
    propsForLabels: { fontSize: 11 },
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* 饼图：消耗占比 */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>咖啡豆消耗占比</Text>
        {hasConsumption ? (
          <PieChart
            data={pieData}
            width={CHART_WIDTH}
            height={200}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="0"
            absolute={false}
          />
        ) : (
          <View style={styles.noData}>
            <Text style={{ color: colors.textSecondary }}>暂无数据</Text>
          </View>
        )}
      </View>

      {/* 折线图：30 天趋势 */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>近 30 天每日消耗 (g)</Text>
        {hasDaily && dailyData.length >= 2 ? (
          <LineChart
            data={{
              labels: lineLabels.length > 10
                ? lineLabels.filter((_, i) => i % Math.ceil(lineLabels.length / 8) === 0)
                : lineLabels,
              datasets: [{ data: lineValues.length === 0 ? [0] : lineValues }],
            }}
            width={CHART_WIDTH}
            height={200}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 12 }}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            fromZero
          />
        ) : hasDaily && dailyData.length === 1 ? (
          <LineChart
            data={{
              labels: lineLabels,
              datasets: [{ data: lineValues }],
            }}
            width={CHART_WIDTH}
            height={200}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 12 }}
            fromZero
          />
        ) : (
          <View style={styles.noData}>
            <Text style={{ color: colors.textSecondary }}>暂无数据</Text>
          </View>
        )}
      </View>

      {/* 柱状图：冲煮方式次数 */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>冲煮方式统计</Text>
        {hasMethods ? (
          <BarChart
            data={{
              labels: barLabels,
              datasets: [{ data: barValues.length === 0 ? [0] : barValues }],
            }}
            width={CHART_WIDTH}
            height={200}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(107, 142, 78, ${opacity})`,
            }}
            style={{ borderRadius: 12 }}
            fromZero
            yAxisLabel=""
            yAxisSuffix=" 次"
            showValuesOnTopOfBars
          />
        ) : (
          <View style={styles.noData}>
            <Text style={{ color: colors.textSecondary }}>暂无数据</Text>
          </View>
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  chartCard: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, marginBottom: 16,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 16, fontWeight: '600', marginBottom: 12,
    alignSelf: 'flex-start',
  },
  noData: { height: 180, justifyContent: 'center', alignItems: 'center' },
});
