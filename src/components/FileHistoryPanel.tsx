import { useState, useMemo, useEffect, useCallback } from "react";
import type { IndexStatus, FileHistoryItem } from "../types";
import { tauriApi } from "../api/tauri";
import { ConfirmDialog } from "./ConfirmDialog";

interface FileHistoryPanelProps {
  indexStatus?: IndexStatus | null;
  skeuoSurface?: string;
  onRefresh?: () => Promise<void> | void;
}

// 格式化时间戳
const formatTimestamp = (timestamp?: number | null) => {
  if (!timestamp) return "暂无";
  return new Date(timestamp * 1000).toLocaleString();
};

// 解析日期范围为时间戳
const parseDateRangeToTs = (start: string, end: string): { start?: number; end?: number } => {
  const toTs = (dateStr: string, endOfDay = false) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return undefined;
    if (endOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return Math.floor(d.getTime() / 1000);
  };
  return {
    start: toTs(start, false),
    end: toTs(end, true),
  };
};

// 超时保护辅助函数
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
};

export function FileHistoryPanel({ indexStatus, skeuoSurface = "bg-white rounded-lg border border-gray-200 shadow-sm", onRefresh, refreshKey }: FileHistoryPanelProps & { refreshKey?: number }) {
  const [fileHistoryItems, setFileHistoryItems] = useState<FileHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState<string>("");
  const [historyEndDate, setHistoryEndDate] = useState<string>("");
  const [historyDaysAgo, setHistoryDaysAgo] = useState<string>("");
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);

  const loadFileHistoryList = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      // 添加超时保护：15秒超时（文件历史可能数据量大）
      const list = await withTimeout(
        tauriApi.getAllFileHistory(),
        15000,
        "加载文件历史超时，数据量可能较大，请稍后重试"
      );
      // 后端已按时间排序，但这里再保险按 last_used 降序
      // 使用 requestIdleCallback 优化数组排序，避免阻塞 UI（无论数据量大小）
      const sorted = await new Promise<FileHistoryItem[]>((resolve) => {
        const worker = () => {
          const sorted = [...list].sort((a, b) => b.last_used - a.last_used);
          resolve(sorted);
        };
        if (window.requestIdleCallback) {
          // 使用 requestIdleCallback 在浏览器空闲时执行排序，避免阻塞 UI
          window.requestIdleCallback(worker, { timeout: 1000 });
        } else {
          // 降级方案：使用 setTimeout 让出主线程
          setTimeout(worker, 0);
        }
      });
      setFileHistoryItems(sorted);
    } catch (error: any) {
      console.error("加载文件历史失败:", error);
      setHistoryMessage(error?.message || "加载文件历史失败");
      // 即使失败也设置空数组，避免 UI 显示异常
      setFileHistoryItems([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // 组件挂载时或 refreshKey 变化时加载文件历史
  useEffect(() => {
    // 延迟加载文件历史（重量数据），让 UI 先渲染
    const timer = setTimeout(() => {
      void loadFileHistoryList();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadFileHistoryList, refreshKey]);

  const handleQueryDaysAgo = useCallback((daysValue?: string) => {
    const value = daysValue !== undefined ? daysValue : historyDaysAgo;
    // 如果天数为空，则查询所有
    if (!value || value.trim() === "") {
      setHistoryStartDate("");
      setHistoryEndDate("");
      return;
    }
    
    // 如果天数不为空，验证是否为有效的数字且 >= 0
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 0) {
      setHistoryMessage("请输入有效的天数（大于等于0）");
      setTimeout(() => setHistoryMessage(null), 3000);
      return;
    }
    
    // 计算n天前的日期（作为结束日期，查询n天前及更早的所有数据）
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    // 开始日期不设置（或设置为空），结束日期设置为n天前
    // 这样会查询n天前及更早的所有历史数据
    setHistoryStartDate("");
    setHistoryEndDate(dateStr);
  }, [historyDaysAgo]);

  // 获取日期范围的辅助函数（确保与查询逻辑完全一致）
  const getPeriodDateRange = useCallback((period: '5days' | '5-10days' | '10-30days' | '30days') => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    switch (period) {
      case '5days': {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 5);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: todayStr,
          daysAgo: "5",
        };
      }
      case '5-10days': {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 10);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 5);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          daysAgo: "10",
        };
      }
      case '10-30days': {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 10);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          daysAgo: "30",
        };
      }
      case '30days': {
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 30);
        return {
          startDate: "",
          endDate: endDate.toISOString().split('T')[0],
          daysAgo: "30",
        };
      }
    }
  }, []);

  // 处理点击汇总统计的时间段，自动查询（清空天数输入框）
  const handleClickSummaryPeriod = useCallback((period: '5days' | '5-10days' | '10-30days' | '30days') => {
    const range = getPeriodDateRange(period);
    setHistoryDaysAgo(""); // 清空天数输入框
    setHistoryStartDate(range.startDate);
    setHistoryEndDate(range.endDate);
  }, [getPeriodDateRange]);

  const filteredHistoryItems = useMemo(() => {
    const { start, end } = parseDateRangeToTs(historyStartDate, historyEndDate);
    return fileHistoryItems.filter((item) => {
      if (start && item.last_used < start) return false;
      if (end && item.last_used > end) return false;
      return true;
    });
  }, [fileHistoryItems, historyStartDate, historyEndDate]);

  // 计算不同时间段的数据汇总（使用与查询完全相同的逻辑）
  const historySummary = useMemo(() => {
    // 使用与点击按钮相同的日期范围计算逻辑
    const range5Days = getPeriodDateRange('5days');
    const range5_10Days = getPeriodDateRange('5-10days');
    const range10_30Days = getPeriodDateRange('10-30days');
    const range30Days = getPeriodDateRange('30days');

    // 使用与 filteredHistoryItems 相同的过滤逻辑
    const { start: start5Days, end: end5Days } = parseDateRangeToTs(range5Days.startDate, range5Days.endDate);
    const { start: start5_10Days, end: end5_10Days } = parseDateRangeToTs(range5_10Days.startDate, range5_10Days.endDate);
    const { start: start10_30Days, end: end10_30Days } = parseDateRangeToTs(range10_30Days.startDate, range10_30Days.endDate);
    const { end: end30Days } = parseDateRangeToTs(range30Days.startDate, range30Days.endDate);

    let count5Days = 0;
    let count5_10Days = 0;
    let count10_30Days = 0;
    let count30DaysOlder = 0;

    // 使用与 filteredHistoryItems 完全相同的过滤逻辑
    fileHistoryItems.forEach((item) => {
      // 近5天
      if (!(start5Days !== undefined && item.last_used < start5Days) &&
          !(end5Days !== undefined && item.last_used > end5Days) &&
          (start5Days !== undefined || end5Days !== undefined)) {
        count5Days++;
        return;
      }

      // 5-10天
      if (!(start5_10Days !== undefined && item.last_used < start5_10Days) &&
          !(end5_10Days !== undefined && item.last_used > end5_10Days) &&
          (start5_10Days !== undefined || end5_10Days !== undefined)) {
        count5_10Days++;
        return;
      }

      // 10-30天
      if (!(start10_30Days !== undefined && item.last_used < start10_30Days) &&
          !(end10_30Days !== undefined && item.last_used > end10_30Days) &&
          (start10_30Days !== undefined || end10_30Days !== undefined)) {
        count10_30Days++;
        return;
      }

      // 30天前（只有 end，没有 start）
      if (!(end30Days !== undefined && item.last_used > end30Days) && end30Days !== undefined) {
        count30DaysOlder++;
      }
    });

    return {
      fiveDaysAgo: count5Days,
      tenDaysAgo: count5_10Days,
      thirtyDaysAgo: count10_30Days,
      older: count30DaysOlder,
    };
  }, [fileHistoryItems, getPeriodDateRange]);

  const handlePurgeHistory = useCallback(async () => {
    try {
      setIsDeletingHistory(true);
      setHistoryMessage(null);
      
      // 基于当前筛选结果进行删除，确保与显示的列表完全一致
      // 获取当前筛选后的路径列表
      const pathsToDelete = filteredHistoryItems.map(item => item.path);
      
      // 逐个删除（或者可以批量删除，但后端目前只支持单个删除）
      let deletedCount = 0;
      for (const path of pathsToDelete) {
        try {
          await tauriApi.deleteFileHistory(path);
          deletedCount++;
        } catch (error) {
          console.error(`删除文件历史失败: ${path}`, error);
          // 继续删除其他项，不因单个失败而停止
        }
      }
      
      setHistoryMessage(`已删除 ${deletedCount} 条记录`);
      await loadFileHistoryList();
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("删除文件历史失败:", error);
      setHistoryMessage(error?.message || "删除文件历史失败");
    } finally {
      setIsDeletingHistory(false);
      setTimeout(() => setHistoryMessage(null), 3000);
    }
  }, [filteredHistoryItems, loadFileHistoryList, onRefresh]);

  const handleOpenDeleteConfirm = useCallback(() => {
    if (!historyStartDate && !historyEndDate && !historyDaysAgo) {
      setHistoryMessage("请先选择筛选条件");
      setTimeout(() => setHistoryMessage(null), 2000);
      return;
    }
    const count = filteredHistoryItems.length;
    if (count === 0) {
      setHistoryMessage("当前筛选无结果");
      setTimeout(() => setHistoryMessage(null), 2000);
      return;
    }
    setPendingDeleteCount(count);
    setIsDeleteConfirmOpen(true);
  }, [historyStartDate, historyEndDate, historyDaysAgo, filteredHistoryItems]);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleteConfirmOpen(false);
    await handlePurgeHistory();
  }, [handlePurgeHistory]);

  const handleCancelDelete = useCallback(() => {
    setIsDeleteConfirmOpen(false);
  }, []);

  return (
    <>
      <div className={`p-4 ${skeuoSurface} md:col-span-2`}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-gray-900">文件历史</div>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
            {(historyStartDate || historyEndDate) 
              ? `${filteredHistoryItems.length} / ${indexStatus?.file_history?.total ?? 0} 条`
              : `${indexStatus?.file_history?.total ?? 0} 条`}
          </span>
        </div>
        <div className="space-y-1 text-sm text-gray-700">
          <div className="break-all">存储路径：{indexStatus?.file_history?.path || "未生成"}</div>
          <div>更新时间：{formatTimestamp(indexStatus?.file_history?.mtime)}</div>
        </div>
        {!isLoadingHistory && fileHistoryItems.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => handleClickSummaryPeriod('5days')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition cursor-pointer"
            >
              <span>近5天</span>
              <span className="font-semibold">{historySummary.fiveDaysAgo}</span>
            </button>
            <button
              onClick={() => handleClickSummaryPeriod('5-10days')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:border-green-300 transition cursor-pointer"
            >
              <span>5-10天</span>
              <span className="font-semibold">{historySummary.tenDaysAgo}</span>
            </button>
            <button
              onClick={() => handleClickSummaryPeriod('10-30days')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300 transition cursor-pointer"
            >
              <span>10-30天</span>
              <span className="font-semibold">{historySummary.thirtyDaysAgo}</span>
            </button>
            <button
              onClick={() => handleClickSummaryPeriod('30days')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition cursor-pointer"
            >
              <span>30天前</span>
              <span className="font-semibold">{historySummary.older}</span>
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1">
            <input
              type="number"
              value={historyDaysAgo}
              onChange={(e) => {
                const newValue = e.target.value;
                setHistoryDaysAgo(newValue);
                // 直接触发查询，传入新值避免异步问题
                handleQueryDaysAgo(newValue);
              }}
              placeholder="天数"
              min="0"
              className="w-16 px-1 py-0.5 text-xs border-0 focus:outline-none focus:ring-0"
            />
            <span className="text-xs text-gray-500">天前</span>
          </div>
          <input
            type="date"
            value={historyStartDate}
            onChange={(e) => {
              setHistoryStartDate(e.target.value);
              // 日期变更会自动触发查询（通过 filteredHistoryItems 的 useMemo）
            }}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-400"
          />
          <span className="text-xs text-gray-500">至</span>
          <input
            type="date"
            value={historyEndDate}
            onChange={(e) => {
              setHistoryEndDate(e.target.value);
              // 日期变更会自动触发查询（通过 filteredHistoryItems 的 useMemo）
            }}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-400"
          />
          {(historyStartDate || historyEndDate || historyDaysAgo) && (
            <button
              onClick={() => {
                setHistoryDaysAgo("");
                setHistoryStartDate("");
                setHistoryEndDate("");
              }}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              清除筛选
            </button>
          )}
          <button
            onClick={handleOpenDeleteConfirm}
            className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 hover:border-red-300 transition"
            disabled={isDeletingHistory}
          >
            {isDeletingHistory ? "删除中..." : "删除当前查询结果"}
          </button>
          {historyMessage && (
            <div className="text-xs text-gray-500">{historyMessage}</div>
          )}
        </div>
        <div className="mt-3 border-t border-gray-100 pt-3 h-64 overflow-y-auto">
          {isLoadingHistory && <div className="text-xs text-gray-500">加载中...</div>}
          {!isLoadingHistory && filteredHistoryItems.length === 0 && (
            <div className="text-xs text-gray-500">暂无历史记录</div>
          )}
          {!isLoadingHistory && filteredHistoryItems.length > 0 && (
            <div className="space-y-2 text-xs text-gray-700">
              {filteredHistoryItems.map((item, index) => (
                <div
                  key={item.path}
                  className="p-2 rounded-md border border-gray-100 hover:border-gray-200 flex items-start gap-2"
                >
                  <span className="text-gray-400 font-mono shrink-0">{index + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{item.name}</div>
                    <div className="text-gray-500 truncate">{item.path}</div>
                    <div className="text-gray-400">
                      使用 {item.use_count} 次 · 最近 {formatTimestamp(item.last_used)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="确认删除"
        message={`确定要删除当前筛选的 ${pendingDeleteCount} 条文件历史记录吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        variant="danger"
      />
    </>
  );
}
