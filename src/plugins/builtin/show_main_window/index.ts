import type { PluginContext } from "../../../types";
import { tauriApi } from "../../../api/tauri";

export default async function execute(context: PluginContext) {
  await tauriApi.showMainWindow();
  await context.hideLauncher();
  context.setQuery("");
  context.setSelectedIndex(0);
}


