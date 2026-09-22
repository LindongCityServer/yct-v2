'use client';

import { FluentOsStorageBridge } from './embedded-hosts/fluentos';

/**
 * 嵌入式宿主桥接的**唯一挂载点**。
 *
 * 宿主专属协议都在各自的适配器里（见 `lib/embedded-host-adapters.ts`），
 * 这里只负责把已适配宿主的桥接挂上。
 *
 * 新增一个网页桌面宿主时：写一份适配器、在这里加一行即可，
 * layout 与通用登录编排都不用动。宿主没有任何专属协议时，
 * 什么都不挂也能获得完整的嵌入登录能力。
 */
export function EmbeddedHostBridges() {
  return (
    <>
      <FluentOsStorageBridge />
    </>
  );
}
