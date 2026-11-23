/**
 * Next.js 服务启动钩子：只做后台预热，不阻塞启动。
 * /盲盒 的候选池冷读要拉地图、地址和线网，机器人重启后第一条请求
 * 很容易撞上完整冷启动；启动时先跑一遍，把最慢的部分放到后台。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { warmQqBotMaterialData } = await import('./lib/qq-bot-material');
  void warmQqBotMaterialData();
}
