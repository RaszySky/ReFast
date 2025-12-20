import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriApi } from "../api/tauri";
import { useEscapeKeyWithPriority } from "../hooks/useEscapeKeyWithPriority";
import { TranslationPanel } from "./TranslationPanel";
import { WordbookPanel } from "./WordbookPanel";

type TabType = "translation" | "wordbook";

export function TranslationWindow() {
  const [activeTab, setActiveTab] = useState<TabType>("translation");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  
  // AI解释相关状态（需要传递给WordbookPanel）
  const [ollamaSettings, setOllamaSettings] = useState<{ model: string; base_url: string }>({
    model: "llama2",
    base_url: "http://localhost:11434",
  });
  
  // Tab顺序配置
  const [tabOrder, setTabOrder] = useState<TabType[]>(["translation", "wordbook"]);
  const [showTabOrderSettings, setShowTabOrderSettings] = useState(false);
  
  // 用于刷新单词本
  const wordbookRefreshRef = useRef<{ current: (() => void) | null }>({ current: null });

  // 处理保存单词后的刷新
  const handleSaveWord = useCallback(async (word: string, translation: string, sourceLang: string, targetLang: string) => {
    await tauriApi.addWordRecord(
      word,
      translation,
      sourceLang,
      targetLang,
      null,
      null,
      null,
      []
    );
    // 如果当前在单词本标签页，刷新列表
    if (activeTab === "wordbook" && wordbookRefreshRef.current.current) {
      wordbookRefreshRef.current.current();
    }
  }, [activeTab]);

  // 加载设置（包括Ollama设置和Tab顺序）
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauriApi.getSettings();
        setOllamaSettings(settings.ollama);
        
        // 加载tab顺序配置
        if (settings.translation_tab_order && Array.isArray(settings.translation_tab_order)) {
          // 验证tab顺序，确保只包含有效的tab类型
          const validTabs = settings.translation_tab_order.filter(
            (tab: string): tab is TabType => tab === "translation" || tab === "wordbook"
          );
          // 确保所有tab都存在
          const allTabs: TabType[] = ["translation", "wordbook"];
          const orderedTabs: TabType[] = [];
          
          // 先添加配置顺序中的tab
          for (const tab of validTabs) {
            if (!orderedTabs.includes(tab)) {
              orderedTabs.push(tab);
            }
          }
          
          // 再添加未在配置中的tab（如果有）
          for (const tab of allTabs) {
            if (!orderedTabs.includes(tab)) {
              orderedTabs.push(tab);
            }
          }
          
          if (orderedTabs.length > 0) {
            setTabOrder(orderedTabs);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadSettings();
  }, []);

  // ESC 键关闭窗口或设置对话框（带优先级）
  const handleCloseWindow = useCallback(async () => {
    const window = getCurrentWindow();
    await window.close();
  }, []);

  useEscapeKeyWithPriority([
    {
      condition: () => showTabOrderSettings,
      callback: () => setShowTabOrderSettings(false),
    },
    {
      condition: () => true, // 默认情况：关闭窗口
      callback: handleCloseWindow,
    },
  ]);


  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-800">翻译工具</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTabOrderSettings(true)}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            title="设置标签页顺序"
          >
            ⚙️ 设置
          </button>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200">
        {tabOrder.map((tab) => {
          const tabConfig = {
            translation: { label: "翻译工具", icon: null },
            wordbook: { label: "📚 单词本", icon: null },
          }[tab];
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {tabConfig.label}
            </button>
          );
        })}
      </div>

      {/* 翻译工具内容 */}
      {activeTab === "translation" && (
        <TranslationPanel
          sourceLang={sourceLang}
          targetLang={targetLang}
          onSourceLangChange={setSourceLang}
          onTargetLangChange={setTargetLang}
          onSaveWord={handleSaveWord}
        />
      )}

      {/* 单词本内容 */}
      {activeTab === "wordbook" && (
        <WordbookPanel
          ollamaSettings={ollamaSettings}
          onRefresh={wordbookRefreshRef.current as any}
        />
      )}

      {/* 标签页顺序设置对话框 */}
      {showTabOrderSettings && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTabOrderSettings(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">标签页顺序设置</h2>
              <button
                onClick={() => setShowTabOrderSettings(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <p className="text-sm text-gray-500 mb-4">
                调整翻译工具窗口中标签页的显示顺序
              </p>
              <div className="space-y-2">
                {tabOrder.map((tab, index) => {
                  const tabLabels: Record<string, string> = {
                    translation: "翻译工具",
                    wordbook: "📚 单词本",
                  };
                  
                  return (
                    <div key={`${tab}-${index}`} className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-6 font-medium">{index + 1}.</span>
                        <span className="text-sm text-gray-700 font-medium">{tabLabels[tab] || tab}</span>
                      </div>
                      <div className="flex gap-1">
                        {index > 0 && (
                          <button
                            onClick={() => {
                              const newOrder = [...tabOrder];
                              [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
                              setTabOrder(newOrder);
                            }}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                            title="上移"
                          >
                            ↑
                          </button>
                        )}
                        {index < tabOrder.length - 1 && (
                          <button
                            onClick={() => {
                              const newOrder = [...tabOrder];
                              [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                              setTabOrder(newOrder);
                            }}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                            title="下移"
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowTabOrderSettings(false);
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    const settings = await tauriApi.getSettings();
                    await tauriApi.saveSettings({
                      ...settings,
                      translation_tab_order: tabOrder,
                    });
                    setShowTabOrderSettings(false);
                  } catch (error) {
                    console.error("Failed to save tab order:", error);
                    alert("保存失败：" + (error instanceof Error ? error.message : String(error)));
                  }
                }}
                className="px-4 py-2 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
