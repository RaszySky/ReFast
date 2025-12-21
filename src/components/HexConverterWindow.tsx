import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useWindowClose } from "../hooks/useWindowClose";

type ConversionMode = "ascii-to-hex" | "hex-to-ascii";

export function HexConverterWindow() {
  const [mode, setMode] = useState<ConversionMode>("ascii-to-hex");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [separator, setSeparator] = useState<string>("space"); // space, comma, none
  const [uppercase, setUppercase] = useState(true);
  const [prefix, setPrefix] = useState(false); // 是否添加 0x 前缀

  const currentWindow = getCurrentWindow();

  useEffect(() => {
    // 设置窗口标题
    currentWindow.setTitle("ASCII 十六进制转换器");
  }, [currentWindow]);

  // Esc 键关闭窗口
  const handleClose = useWindowClose();

  useEscapeKey(handleClose);

  // ASCII 转十六进制
  const asciiToHex = (text: string): string => {
    const hexArray: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      let hex = charCode.toString(16);
      hex = hex.length === 1 ? "0" + hex : hex;
      hex = uppercase ? hex.toUpperCase() : hex.toLowerCase();
      if (prefix) {
        hex = "0x" + hex;
      }
      hexArray.push(hex);
    }
    
    let result = "";
    switch (separator) {
      case "space":
        result = hexArray.join(" ");
        break;
      case "comma":
        result = hexArray.join(", ");
        break;
      case "none":
        result = hexArray.join("");
        break;
      default:
        result = hexArray.join(" ");
    }
    
    return result;
  };

  // 十六进制转 ASCII
  const hexToAscii = (hex: string): string => {
    // 清理输入：移除空格、逗号、0x 前缀等
    let cleanHex = hex.replace(/[\s,]+/g, "");
    cleanHex = cleanHex.replace(/0x/gi, "");
    
    // 检查是否为有效的十六进制字符串
    if (!/^[0-9A-Fa-f]*$/.test(cleanHex)) {
      throw new Error("输入包含无效的十六进制字符");
    }
    
    // 如果长度为奇数，补0
    if (cleanHex.length % 2 !== 0) {
      cleanHex = "0" + cleanHex;
    }
    
    let result = "";
    for (let i = 0; i < cleanHex.length; i += 2) {
      const hexByte = cleanHex.substr(i, 2);
      const charCode = parseInt(hexByte, 16);
      result += String.fromCharCode(charCode);
    }
    
    return result;
  };

  // 执行转换
  const performConversion = (inputText: string) => {
    if (!inputText.trim()) {
      setOutput("");
      setError(null);
      return;
    }

    try {
      if (mode === "ascii-to-hex") {
        const result = asciiToHex(inputText);
        setOutput(result);
        setError(null);
      } else {
        const result = hexToAscii(inputText);
        setOutput(result);
        setError(null);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "转换失败";
      setError(errorMessage);
      setOutput("");
    }
  };

  // 当输入或设置改变时自动转换
  useEffect(() => {
    performConversion(input);
  }, [input, mode, separator, uppercase, prefix]);

  // 切换转换模式
  const toggleMode = () => {
    setMode((prev) =>
      prev === "ascii-to-hex" ? "hex-to-ascii" : "ascii-to-hex"
    );
    // 交换输入输出
    const temp = input;
    setInput(output);
    setOutput(temp);
    setError(null);
  };

  // 清空
  const handleClear = () => {
    setInput("");
    setOutput("");
    setError(null);
  };

  // 复制输出
  const handleCopy = async () => {
    if (output) {
      try {
        await navigator.clipboard.writeText(output);
        // 可以添加一个临时提示
      } catch (err) {
        console.error("复制失败:", err);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        data-tauri-drag-region
      >
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          ASCII 十六进制转换器
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMode}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            title="切换转换方向"
          >
            ⇄ 切换
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            title="清空"
          >
            清空
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-auto">
        {/* 转换模式指示 */}
        <div className="flex items-center justify-center gap-4 py-2">
          <span
            className={`px-4 py-2 rounded-lg font-medium ${
              mode === "ascii-to-hex"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            ASCII 文本
          </span>
          <span className="text-2xl text-gray-400">→</span>
          <span
            className={`px-4 py-2 rounded-lg font-medium ${
              mode === "hex-to-ascii"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            }`}
          >
            十六进制
          </span>
        </div>

        {/* 输入区域 */}
        <div className="flex-1 flex flex-col min-h-0">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            输入 ({mode === "ascii-to-hex" ? "ASCII 文本" : "十六进制"})
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     font-mono text-sm resize-none"
            placeholder={
              mode === "ascii-to-hex"
                ? "输入 ASCII 文本..."
                : "输入十六进制（支持空格、逗号分隔，支持 0x 前缀）..."
            }
            spellCheck={false}
          />
        </div>

        {/* 十六进制格式选项（仅在 ASCII 转十六进制模式下显示） */}
        {mode === "ascii-to-hex" && (
          <div className="flex flex-wrap gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                分隔符:
              </label>
              <select
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="space">空格</option>
                <option value="comma">逗号</option>
                <option value="none">无</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uppercase}
                  onChange={(e) => setUppercase(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                大写字母
              </label>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefix}
                  onChange={(e) => setPrefix(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                添加 0x 前缀
              </label>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              ❌ {error}
            </p>
          </div>
        )}

        {/* 输出区域 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              输出 ({mode === "ascii-to-hex" ? "十六进制" : "ASCII 文本"})
            </label>
            {output && (
              <button
                onClick={handleCopy}
                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                title="复制输出"
              >
                📋 复制
              </button>
            )}
          </div>
          <textarea
            value={output}
            readOnly
            className="flex-1 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                     bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     font-mono text-sm resize-none"
            placeholder="转换结果将显示在这里..."
            spellCheck={false}
          />
        </div>

        {/* 帮助提示 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            💡 提示: 
            {mode === "ascii-to-hex"
              ? " 输入任意 ASCII 文本，将自动转换为十六进制格式"
              : " 输入十六进制字符串（支持多种格式：48656C6C6F 或 48 65 6C 6C 6F 或 0x48,0x65...）"}
          </p>
        </div>
      </div>
    </div>
  );
}
