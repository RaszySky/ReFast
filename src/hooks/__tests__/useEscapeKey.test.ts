import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEscapeKey } from "../useEscapeKey";

describe("useEscapeKey", () => {
  let mockOnEscape: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnEscape = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("应该在按下 Esc 键时调用回调", () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it("应该在按下 keyCode 27 时调用回调", () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const event = new KeyboardEvent("keydown", {
      keyCode: 27,
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it("应该阻止默认行为和事件传播", () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");

    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it("不应该在其他键按下时调用回调", () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it("应该在禁用时不调用回调", () => {
    renderHook(() => useEscapeKey(mockOnEscape, false));

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it("应该在组件卸载时移除事件监听器", () => {
    const { unmount } = renderHook(() => useEscapeKey(mockOnEscape));

    unmount();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    document.dispatchEvent(event);

    // 由于事件监听器已移除，回调不应该被调用
    // 但这里我们主要测试不会报错
    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it("应该在回调函数变化时更新监听器", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const { rerender } = renderHook(
      ({ callback }) => useEscapeKey(callback),
      {
        initialProps: { callback: firstCallback },
      }
    );

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();

    rerender({ callback: secondCallback });
    document.dispatchEvent(event);

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });
});

