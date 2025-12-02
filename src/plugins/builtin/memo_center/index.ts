import type { PluginContext } from "../../../types";

export default async function execute(context: PluginContext) {
  // 打开独立的备忘录窗口
  if (context.tauriApi) {
    await context.tauriApi.showMemoWindow();
    // 关闭启动器
    await context.hideLauncher();
  }
}


