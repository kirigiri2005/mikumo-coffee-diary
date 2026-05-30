# mikumo的咖啡日记 ☕

一个完全运行在手机本地、无服务器的咖啡豆库存管理与冲煮记录应用。记录每一包豆子的来处与每一杯咖啡的味道。

**离线优先 · 数据自有 · 开源免费**

## 功能

### 咖啡豆库存
- 添加/编辑/删除咖啡豆，记录**名称、产国、产区、庄园、豆种、处理法、烘焙度、风味**等完整信息
- **克价自动计算**（总价 ÷ 净含量），**剩余克数实时汇总**（扣除所有冲煮用量）
- 卡片展示剩余克数、剩余价值、烘焙日期
- 设置**最佳赏味天数**，自动提醒已过赏味期
- 低库存警告（< 30g），豆子用完自动隐藏

### 每日冲煮记录
- 记录每次冲煮的**豆子、克数、方式、水温、研磨度、风味笔记**
- 选豆子时实时显示剩余克数，**库存不足自动拦截**
- 冲煮方式/研磨度/克数均提供快捷按钮 + 自由输入
- 时间线布局，支持**按豆子或方式筛选**，**分页加载**
- 编辑/删除记录时库存自动同步（实时 SQL 聚合，无冗余存储）
- 冲煮记录**一键导出 CSV**

### 统计图表
- 各咖啡豆累计消耗占比**饼图**
- 近 30 天每日消耗趋势**折线图**
- 各冲煮方式使用次数**柱状图**
- 咖啡主题暖色配色

### 数据安全
- 所有数据存储在**手机本地 SQLite**，不上传任何服务器
- 支持 **JSON 备份导出**与**导入恢复**
- 导入前自动备份当前数据，事务保护防数据丢失

### 体验
- 暖棕色咖啡主题，**自动跟随系统深色模式**
- 库存总览仪表盘（总剩余克数 + 总剩余价值）
- 四 Tab 导航：库存 / 记录 / 统计 / 设置

## 技术栈

| 层 | 选型 |
|---|------|
| 框架 | React Native + Expo SDK 52 |
| 路由 | Expo Router（文件路由） |
| 数据库 | expo-sqlite（WAL 模式，异步 API） |
| 图表 | react-native-chart-kit + react-native-svg |
| 日期 | dayjs |
| 语言 | TypeScript |

## 项目结构

```
app/
├── _layout.tsx                 # 根布局（主题 + 数据库初始化）
└── (tabs)/
    ├── _layout.tsx             # 底部四 Tab 导航
    ├── index.tsx               # 库存页（豆子 CRUD + 仪表盘）
    ├── logs.tsx                # 记录页（冲煮 CRUD + 筛选 + CSV导出）
    ├── stats.tsx               # 统计页（饼图 + 折线图 + 柱状图）
    └── settings.tsx            # 设置页（备份 + 恢复）
src/
├── database.ts                 # SQLite 建表 + 迁移
├── theme.ts                    # 暖棕色主题色板 + 图表配色
├── db/
│   ├── beans.ts                # 咖啡豆 CRUD（实时库存聚合）
│   ├── brews.ts                # 冲煮 CRUD（事务校验）
│   └── stats.ts                # 图表数据查询
└── contexts/
    ├── ThemeContext.tsx         # 深色/浅色主题 Provider
    └── DatabaseContext.tsx      # 数据库实例 Provider
```

## 快速开始

环境要求：Node.js 18+、npm 9+、Expo CLI

```bash
# 安装依赖
npm install

# 启动开发服务器
npx expo start

# 手机安装 Expo Go 扫码即可预览
```

## 构建 APK

```bash
# 1. 生成原生项目
npx expo prebuild --platform android

# 2. 构建 Release APK
cd android
./gradlew assembleRelease

# APK 位于: android/app/build/outputs/apk/release/app-release.apk
```

> 构建需要 Android SDK 和 JDK 17。建议先配置 Gradle 镜像加速下载。

## 数据库设计

库存通过 SQL 聚合实时计算，**不冗余存储剩余克数**，避免数据不一致：

```sql
SELECT
  net_weight - COALESCE(
    (SELECT SUM(dose_grams) FROM brew_logs WHERE bean_id = c.id), 0
  ) AS remaining_weight
FROM coffee_beans c;
```

冲煮保存时使用**事务校验库存**，防止超量扣减。

## License

MIT © [kirigiri2005](https://github.com/kirigiri2005)
