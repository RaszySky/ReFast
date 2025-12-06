import { useState, useMemo, useEffect } from "react";
import { plugins, executePlugin } from "../plugins";
import type { PluginContext } from "../types";
import { tauriApi } from "../api/tauri";
import { listen, emit } from "@tauri-apps/api/event";
import { OllamaSettingsPage, SystemSettingsPage, AboutSettingsPage } from "./SettingsPages";

// 菜单分类类型
type MenuCategory = "plugins" | "settings" | "about";

// 设置子页面类型
type SettingsPage = "system" | "ollama";

// 设置接口
interface Settings {
  ollama: {
    model: string;
    base_url: string;
  };
  startup_enabled?: boolean;
}

interface MenuItem {
  id: MenuCategory;
  name: string;
  icon: JSX.Element;
}

const menuItems: MenuItem[] = [
  {
    id: "plugins",
    name: "插件",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: "settings",
    name: "设置",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: "about",
    name: "关于",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

interface AppCenterContentProps {
  onPluginClick?: (pluginId: string) => Promise<void>;
  onClose?: () => void;
}

export function AppCenterContent({ onPluginClick, onClose }: AppCenterContentProps) {
  const [activeCategory, setActiveCategory] = useState<MenuCategory>("plugins");
  const [searchQuery, setSearchQuery] = useState("");
  
  // 设置相关状态
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>("system");
  const [settings, setSettings] = useState<Settings>({
    ollama: {
      model: "llama2",
      base_url: "http://localhost:11434",
    },
    startup_enabled: false,
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 处理插件点击
  const handlePluginClick = async (pluginId: string) => {
    if (onPluginClick) {
      await onPluginClick(pluginId);
    } else {
      // 默认行为：创建插件上下文并执行
      const pluginContext: PluginContext = {
        setQuery: () => {},
        setSelectedIndex: () => {},
        hideLauncher: async () => {
          onClose?.();
        },
        tauriApi,
      };
      await executePlugin(pluginId, pluginContext);
      onClose?.();
    }
  };

  // 加载设置
  const loadSettings = async () => {
    try {
      setIsLoadingSettings(true);
      const data = await tauriApi.getSettings();
      // 同步开机启动状态
      const startupEnabled = await tauriApi.isStartupEnabled();
      setSettings({
        ...data,
        startup_enabled: startupEnabled,
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  // 保存设置
  const saveSettings = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      await tauriApi.saveSettings(settings);
      // 保存开机启动设置
      if (settings.startup_enabled !== undefined) {
        await tauriApi.setStartupEnabled(settings.startup_enabled);
      }
      setSaveMessage("设置已保存");
      setTimeout(() => setSaveMessage(null), 2000);
      
      // 发送设置更新事件，通知其他窗口
      await emit("settings:updated", {});
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveMessage("保存失败");
      setTimeout(() => setSaveMessage(null), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  // 测试连接
  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const baseUrl = settings.ollama.base_url || 'http://localhost:11434';
      const model = settings.ollama.model || 'llama2';
      
      // 尝试使用 chat API 测试连接
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: '你好',
            },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        // 如果 chat API 失败，尝试使用 generate API
        const generateResponse = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt: '你好',
            stream: false,
          }),
        });

        if (!generateResponse.ok) {
          throw new Error(`API 请求失败: ${generateResponse.status} ${generateResponse.statusText}`);
        }

        await generateResponse.json();
        setTestResult({
          success: true,
          message: `连接成功！模型 "${model}" 可用。`,
        });
      } else {
        await response.json();
        setTestResult({
          success: true,
          message: `连接成功！模型 "${model}" 可用。`,
        });
      }
    } catch (error: any) {
      console.error('测试连接失败:', error);
      const errorMessage = error.message || '未知错误';
      setTestResult({
        success: false,
        message: `连接失败: ${errorMessage}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 打开快捷键设置
  const handleOpenHotkeySettings = async () => {
    try {
      await tauriApi.showHotkeySettings();
    } catch (error) {
      console.error("Failed to open hotkey settings:", error);
      alert("打开快捷键设置失败");
    }
  };

  // 当切换到设置分类时加载设置
  useEffect(() => {
    if (activeCategory === "settings") {
      loadSettings();
      
      // 监听设置刷新事件
      const unlisten = listen("settings:refresh", () => {
        loadSettings();
      });

      return () => {
        unlisten.then((fn) => fn());
      };
    }
  }, [activeCategory]);

  // 过滤插件
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) {
      return plugins;
    }
    const query = searchQuery.toLowerCase();
    return plugins.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.description?.toLowerCase().includes(query) ||
        plugin.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  // 渲染当前分类的内容
  const renderContent = () => {
    switch (activeCategory) {
      case "plugins":
        return (
          <div className="space-y-3">
            {filteredPlugins.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? "未找到匹配的插件" : "暂无插件"}
              </div>
            ) : (
              filteredPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  onClick={() => handlePluginClick(plugin.id)}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors bg-white cursor-pointer active:bg-gray-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-green-100">
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800">{plugin.name}</div>
                      {plugin.description && (
                        <div className="text-sm text-gray-500 mt-1">{plugin.description}</div>
                      )}
                      {plugin.keywords && plugin.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {plugin.keywords.map((keyword, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      case "settings":
        if (isLoadingSettings) {
          return (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-600">加载中...</div>
            </div>
          );
        }

        const settingsMenuItems = [
          { id: "system" as SettingsPage, label: "系统设置", icon: "⚙️" },
          { id: "ollama" as SettingsPage, label: "Ollama 配置", icon: "🤖" },
        ];

        return (
          <div className="flex-1 flex overflow-hidden">
            {/* 设置子导航 */}
            <div className="w-48 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
              <nav className="p-4">
                <ul className="space-y-1">
                  {settingsMenuItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSettingsPage(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                          activeSettingsPage === item.id
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-sm">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              
              {/* 保存按钮 */}
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {isSaving ? "保存中..." : "保存设置"}
                </button>
                {saveMessage && (
                  <div className={`mt-2 text-xs text-center ${
                    saveMessage === "设置已保存" ? "text-green-600" : "text-red-600"
                  }`}>
                    {saveMessage}
                  </div>
                )}
              </div>
            </div>

            {/* 设置内容区域 */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              <div className="p-6 max-w-4xl">
                {activeSettingsPage === "ollama" && (
                  <OllamaSettingsPage
                    settings={settings}
                    onSettingsChange={setSettings}
                    isTesting={isTesting}
                    testResult={testResult}
                    onTestConnection={testConnection}
                  />
                )}
                {activeSettingsPage === "system" && (
                  <SystemSettingsPage
                    settings={settings}
                    onSettingsChange={setSettings}
                    onOpenHotkeySettings={handleOpenHotkeySettings}
                  />
                )}
              </div>
            </div>
          </div>
        );
      case "about":
        return (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-6 max-w-4xl mx-auto">
              <AboutSettingsPage />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-48 border-r border-gray-200 bg-white flex-shrink-0 flex flex-col">
        <nav className="flex-1 p-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveCategory(item.id);
                setSearchQuery(""); // 切换分类时清空搜索
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 ${
                activeCategory === item.id
                  ? "bg-green-50 text-green-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={activeCategory === item.id ? "text-green-600" : "text-gray-500"}>
                {item.icon}
              </span>
              <span>{item.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search Bar - 仅在插件分类显示 */}
        {activeCategory === "plugins" && (
          <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索插件..."
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Scrollable Content - 设置和关于页面占据整个区域，其他页面有 padding */}
        {activeCategory === "settings" || activeCategory === "about" ? (
          renderContent()
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">{renderContent()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

