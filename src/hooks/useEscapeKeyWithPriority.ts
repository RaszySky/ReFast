import { useEffect } from "react";

/**
 * 带优先级的 Esc 键处理 Hook
 * 按优先级顺序检查条件，执行第一个匹配的回调
 * 
 * @param handlers - 处理函数数组，按优先级排序
 *   - condition: 条件函数，返回 true 时执行对应的 callback
 *   - callback: 满足条件时执行的回调函数
 * @param enabled - 是否启用（默认为 true）
 * 
 * @example
 * ```tsx
 * useEscapeKeyWithPriority([
 *   {
 *     condition: () => isEditing,
 *     callback: handleCancelEdit
 *   },
 *   {
 *     condition: () => isDialogOpen,
 *     callback: () => setIsDialogOpen(false)
 *   },
 *   {
 *     condition: () => true, // 默认情况
 *     callback: handleCloseWindow
 *   }
 * ]);
 * ```
 */
export function useEscapeKeyWithPriority(
  handlers: Array<{ condition: () => boolean; callback: () => void | Promise<void> }>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();

        // 按优先级顺序检查条件
        for (const handler of handlers) {
          if (handler.condition()) {
            await handler.callback();
            return; // 执行后立即返回，不继续检查后续条件
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handlers, enabled]);
}

