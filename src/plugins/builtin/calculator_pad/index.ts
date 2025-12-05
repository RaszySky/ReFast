import type { PluginContext } from "../../../types";

export default async function execute(context: PluginContext) {
  // 打开独立的计算稿纸窗口
  if (context.tauriApi) {
    await context.tauriApi.showCalculatorPadWindow();
    // 关闭启动器
    await context.hideLauncher();
  }
}

