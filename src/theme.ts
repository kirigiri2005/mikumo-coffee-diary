// 暖棕色咖啡主题 — 浅色/深色配色方案

export interface ThemeColors {
  background: string;
  card: string;
  primary: string;
  primaryDark: string;
  accent: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  warning: string;
  error: string;
  success: string;
}

const light: ThemeColors = {
  background: '#FDF8F0',
  card: '#FFFFFF',
  primary: '#8B5E3C',
  primaryDark: '#5C3D2E',
  accent: '#D4A574',
  surface: '#F5E6D3',
  text: '#3E2723',
  textSecondary: '#8D6E63',
  border: '#E0CFC0',
  warning: '#E8A838',
  error: '#C0392B',
  success: '#6B8E4E',
};

const dark: ThemeColors = {
  background: '#1A1410',
  card: '#2C2219',
  primary: '#C8966C',
  primaryDark: '#A0704C',
  accent: '#8B6B4A',
  surface: '#3D3027',
  text: '#F0E6DC',
  textSecondary: '#B8A898',
  border: '#4A3D32',
  warning: '#D4982A',
  error: '#E06050',
  success: '#7DA060',
};

export const Colors = { light, dark };

// 咖啡主题的图表配色（饼图用）
export const ChartColors = [
  '#8B5E3C', // 暖棕
  '#D4A574', // 金色
  '#6B8E4E', // 抹茶绿
  '#C4884D', // 橘棕
  '#A0522D', // 锡耶纳棕
  '#8FBC8F', // 暗海绿
  '#DEB887', // 实木色
  '#CD853F', // 秘鲁棕
];
