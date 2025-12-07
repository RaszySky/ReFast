import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

// 支持的语言列表
const LANGUAGES = [
  { code: "auto", name: "自动检测" },
  { code: "zh", name: "中文" },
  { code: "en", name: "英语" },
  { code: "ja", name: "日语" },
  { code: "ko", name: "韩语" },
  { code: "fr", name: "法语" },
  { code: "de", name: "德语" },
  { code: "es", name: "西班牙语" },
  { code: "ru", name: "俄语" },
  { code: "pt", name: "葡萄牙语" },
  { code: "it", name: "意大利语" },
  { code: "ar", name: "阿拉伯语" },
  { code: "th", name: "泰语" },
  { code: "vi", name: "越南语" },
];

// 使用免费的 Google Translate API（无需 API key）
async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text.trim()) {
    return "";
  }

  try {
    // 使用 Google Translate 的免费接口
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`翻译请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 解析返回的数据
    if (Array.isArray(data) && data[0] && Array.isArray(data[0])) {
      const translatedParts = data[0].map((item: any[]) => item[0]).filter(Boolean);
      return translatedParts.join("");
    }
    
    throw new Error("翻译结果格式错误");
  } catch (error) {
    console.error("翻译错误:", error);
    throw error;
  }
}

export function TranslationWindow() {
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const translateTimeoutRef = useRef<number | null>(null);

  // 监听来自启动器的文本设置事件
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>("translation:set-text", (event) => {
          const text = event.payload;
          if (text) {
            setSourceText(text);
            // 自动翻译
            handleTranslate(text, sourceLang, targetLang);
          }
        });
      } catch (error) {
        console.error("Failed to setup translation event listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sourceLang, targetLang]);

  // 自动翻译（防抖）
  useEffect(() => {
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }

    if (!sourceText.trim()) {
      setTranslatedText("");
      setError(null);
      return;
    }

    translateTimeoutRef.current = window.setTimeout(() => {
      handleTranslate(sourceText, sourceLang, targetLang);
    }, 500); // 500ms 防抖

    return () => {
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
    };
  }, [sourceText, sourceLang, targetLang]);

  const handleTranslate = async (text: string, from: string, to: string) => {
    if (!text.trim()) {
      setTranslatedText("");
      setError(null);
      return;
    }

    setIsTranslating(true);
    setError(null);
    setDetectedLang(null);

    try {
      // 如果源语言是自动检测，先检测语言
      let actualFrom = from;
      if (from === "auto") {
        // 使用 Google Translate 检测语言
        try {
          const detectUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
          const detectResponse = await fetch(detectUrl);
          if (detectResponse.ok) {
            const detectData = await detectResponse.json();
            if (detectData[2]) {
              actualFrom = detectData[2];
              setDetectedLang(actualFrom);
            }
          }
        } catch (e) {
          console.warn("语言检测失败，使用默认设置", e);
        }
      }

      // 如果检测到的语言和目标语言相同，不进行翻译
      if (actualFrom === to) {
        setTranslatedText(text);
        setIsTranslating(false);
        return;
      }

      const result = await translateText(text, actualFrom, to);
      setTranslatedText(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "翻译失败";
      setError(errorMessage);
      setTranslatedText("");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSwapLanguages = () => {
    const tempLang = sourceLang;
    setSourceLang(targetLang === "auto" ? "zh" : targetLang);
    setTargetLang(tempLang === "auto" ? "zh" : tempLang);
    // 交换文本
    const tempText = sourceText;
    setSourceText(translatedText);
    setTranslatedText(tempText);
  };

  const handleCopySource = async () => {
    if (sourceText) {
      await navigator.clipboard.writeText(sourceText);
    }
  };

  const handleCopyTranslated = async () => {
    if (translatedText) {
      await navigator.clipboard.writeText(translatedText);
    }
  };

  const handleClear = () => {
    setSourceText("");
    setTranslatedText("");
    setError(null);
    setDetectedLang(null);
  };

  // ESC 键关闭窗口
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        const window = getCurrentWindow();
        await window.close();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-800">翻译工具</h1>
        <div className="flex items-center gap-2">
          {detectedLang && (
            <span className="text-xs text-gray-500">
              检测到: {LANGUAGES.find((l) => l.code === detectedLang)?.name || detectedLang}
            </span>
          )}
          <button
            onClick={handleClear}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* 语言选择栏 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleSwapLanguages}
          className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          title="交换语言"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        </button>

        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.filter((lang) => lang.code !== "auto").map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 源文本区域 */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              {LANGUAGES.find((l) => l.code === sourceLang)?.name || "源语言"}
            </label>
            <button
              onClick={handleCopySource}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              title="复制"
            >
              复制
            </button>
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="输入要翻译的文本..."
            className="flex-1 w-full px-4 py-3 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ fontFamily: "inherit" }}
          />
        </div>

        {/* 翻译结果区域 */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              {LANGUAGES.find((l) => l.code === targetLang)?.name || "目标语言"}
            </label>
            <button
              onClick={handleCopyTranslated}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              title="复制"
            >
              复制
            </button>
          </div>
          <div className="flex-1 relative">
            {isTranslating && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
                <div className="flex items-center gap-2 text-gray-600">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm">翻译中...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50 border border-red-200 rounded-lg">
                <div className="text-sm text-red-600 text-center px-4">
                  {error}
                </div>
              </div>
            )}
            <textarea
              value={translatedText}
              readOnly
              placeholder="翻译结果将显示在这里..."
              className="w-full h-full px-4 py-3 text-sm border border-gray-300 rounded-lg resize-none bg-gray-50 focus:outline-none"
              style={{ fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

