import type { MetroWayfindingLayoutSummary, MetroWayfindingProjectFile } from './metro-wayfinding';

export interface MetroWayfindingExampleSource {
  id: string;
  label: string;
  remark: string;
  path: string;
}

export interface MetroWayfindingExample {
  source: MetroWayfindingExampleSource;
  project: MetroWayfindingProjectFile;
  summary: MetroWayfindingLayoutSummary;
}

const metroWayfindingExampleRemarks = [
  '去往10号线、出口及无障碍电梯标志',
  '无障碍电梯标志',
  '去往4号线标志（换乘站）',
  '中华路去往各个出口方向标志（短版，2023年）',
  '乘车与自动售票标志（非换乘站）',
  '滂江街站换乘及出口方向辅助导向标志（局部）',
  '沈阳站站出口信息标志',
  '中医药大学站站厅换乘10号线及出口方向指引标志',
  '沈阳9号线运行方向标志',
  '去往出口及楼梯标志（用于运行方向标志背面）',
  '去往4号线辅助导向标志',
  '工业展览馆站站外地徽标志（局部）',
  '滂江街站附着式辅助换乘导向标志',
] as const;

export const metroWayfindingExampleSources: MetroWayfindingExampleSource[] = Array.from(
  { length: metroWayfindingExampleRemarks.length },
  (_, index) => {
    const id = index.toString().padStart(2, '0');
    return {
      id: `metro-wayfinding-example-${id}`,
      label: `示例工程 ${id}`,
      remark: metroWayfindingExampleRemarks[index]!,
      path: `/material-project-examples/metro-wayfinding/${id}.json`,
    };
  },
);
