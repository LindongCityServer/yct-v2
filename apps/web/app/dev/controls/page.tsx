import { notFound } from 'next/navigation';
import { ControlsShowcase } from './controls-showcase';

// 控件展示板仅用于开发调试：
// - 开发环境（next dev）默认开放；
// - 生产环境必须显式设置 NEXT_PUBLIC_ENABLE_CONTROLS=1 才可访问，否则直接 404。
export default function DevControlsPage() {
  const isControlsBoardEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_CONTROLS === '1';

  if (!isControlsBoardEnabled) {
    notFound();
  }

  return <ControlsShowcase />;
}
