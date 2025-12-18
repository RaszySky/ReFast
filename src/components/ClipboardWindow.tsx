import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { tauriApi } from "../api/tauri";
import type { ClipboardItem } from "../types";

export function ClipboardWindow() {
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ClipboardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [imageDataUrls, setImageDataUrls] = useState<Map<string, string>>(new Map());

  const loadClipboardItems = async () => {
    try {
      const items = await tauriApi.getAllClipboardItems();
      setClipboardItems(items);
      setFilteredItems(items);
      
      // 预加载图片数据
      const newImageDataUrls = new Map<string, string>();
      for (const item of items) {
        if (item.content_type === "image" && !imageDataUrls.has(item.content)) {
          try {
            const imageData = await tauriApi.getClipboardImageData(item.content);
            const blob = new Blob([imageData], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            newImageDataUrls.set(item.content, url);
          } catch (error) {
            console.error("Failed to load image:", error);
          }
        }
      }
      setImageDataUrls(prev => new Map([...prev, ...newImageDataUrls]));
    } catch (error) {
      console.error("Failed to load clipboard items:", error);
    }
  };

  useEffect(() => {
    loadClipboardItems();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredItems(clipboardItems);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = clipboardItems.filter((item) =>
        item.content.toLowerCase().includes(query)
      );
      setFilteredItems(filtered);
    }
  }, [searchQuery, clipboardItems]);

  const handleClose = useCallback(async () => {
    const window = getCurrentWindow();
    await window.close();
  }, []);

  const handleCopyToClipboard = async (item: ClipboardItem) => {
    try {
      if (item.content_type === "image") {
        // 复制图片到剪切板
        await tauriApi.copyImageToClipboard(item.content);
      } else {
        // 复制文本到剪切板
        await navigator.clipboard.writeText(item.content);
      }
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const handleEdit = (item: ClipboardItem) => {
    setSelectedItem(item);
    setEditContent(item.content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    
    try {
      const updated = await tauriApi.updateClipboardItem(
        selectedItem.id,
        editContent
      );
      setClipboardItems((items) =>
        items.map((item) => (item.id === updated.id ? updated : item))
      );
      setIsEditing(false);
      setSelectedItem(null);
      setEditContent("");
    } catch (error) {
      console.error("Failed to update clipboard item:", error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setSelectedItem(null);
    setEditContent("");
  };

  const handleToggleFavorite = async (item: ClipboardItem) => {
    try {
      const updated = await tauriApi.toggleFavoriteClipboardItem(item.id);
      setClipboardItems((items) =>
        items.map((i) => (i.id === updated.id ? updated : i))
      );
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleDelete = async (item: ClipboardItem) => {
    const confirmed = await confirm(`确定要删除这条剪切板记录吗？`, {
      title: "确认删除",
      kind: "warning",
    });

    if (!confirmed) return;

    try {
      await tauriApi.deleteClipboardItem(item.id);
      setClipboardItems((items) => items.filter((i) => i.id !== item.id));
      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to delete clipboard item:", error);
    }
  };

  const handleClearHistory = async () => {
    const confirmed = await confirm(
      "确定要清空所有非收藏的剪切板历史吗？此操作不可恢复。",
      {
        title: "确认清空",
        kind: "warning",
      }
    );

    if (!confirmed) return;

    try {
      await tauriApi.clearClipboardHistory();
      await loadClipboardItems();
      setSelectedItem(null);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to clear clipboard history:", error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else if (minutes > 0) {
      return `${minutes}分钟前`;
    } else {
      return "刚刚";
    }
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        
        if (isEditing) {
          handleCancelEdit();
        } else if (selectedItem) {
          setSelectedItem(null);
        } else {
          await handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isEditing, selectedItem, handleClose]);

  return (
    <div className="h-screen w-screen flex bg-gray-50">
      {/* Left Panel - List */}
      <div className="w-2/5 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">剪切板历史</h2>
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              关闭
            </button>
          </div>
          
          {/* Search Box */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索剪切板内容..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="p-3 border-b border-gray-200 flex gap-2">
          <button
            onClick={handleClearHistory}
            className="flex-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors border border-red-200"
          >
            清空历史
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 text-center">
              {searchQuery ? "没有找到匹配的内容" : "还没有剪切板历史"}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                    selectedItem?.id === item.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-gray-500">
                        {formatDate(item.created_at)}
                      </span>
                      {item.is_favorite && (
                        <span className="text-yellow-500 text-sm" title="收藏">
                          ★
                        </span>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                      {item.content_type}
                    </span>
                  </div>
                  {item.content_type === "image" ? (
                    <div className="flex items-center gap-2">
                      {imageDataUrls.has(item.content) && (
                        <img 
                          src={imageDataUrls.get(item.content)} 
                          alt="clipboard" 
                          className="w-10 h-10 object-cover rounded"
                        />
                      )}
                      <span className="text-sm text-gray-600">图片</span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-800 truncate">
                      {item.content || "(空内容)"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Detail */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedItem ? (
          <>
            {/* Detail Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800">
                  {isEditing ? "编辑内容" : "详细内容"}
                </h3>
                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                  {selectedItem.content_type}
                </span>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                      保存
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    {selectedItem.content_type === "text" && (
                      <button
                        onClick={() => handleEdit(selectedItem)}
                        className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        编辑
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleFavorite(selectedItem)}
                      className={`px-3 py-1.5 text-sm rounded transition-colors ${
                        selectedItem.is_favorite
                          ? "text-yellow-600 hover:bg-yellow-50"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {selectedItem.is_favorite ? "取消收藏" : "收藏"}
                    </button>
                    <button
                      onClick={() => handleCopyToClipboard(selectedItem)}
                      className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded transition-colors"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => handleDelete(selectedItem)}
                      className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
                  placeholder="输入内容..."
                />
              ) : (
                <div className="w-full h-full">
                  <div className="mb-3 text-xs text-gray-500">
                    创建时间: {new Date(selectedItem.created_at * 1000).toLocaleString()}
                  </div>
                  {selectedItem.content_type === "image" ? (
                    <div className="flex items-center justify-center h-full">
                      {imageDataUrls.has(selectedItem.content) ? (
                        <img 
                          src={imageDataUrls.get(selectedItem.content)} 
                          alt="clipboard" 
                          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                        />
                      ) : (
                        <div className="text-gray-400">加载图片中...</div>
                      )}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm text-gray-800 p-3 bg-gray-50 rounded-lg">
                      {selectedItem.content || "(空内容)"}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-sm">选择一条剪切板记录查看详情</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
