import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  formatRelativeTime,
  formatDateString,
  formatStandardDateTime,
  formatFullDateTime,
  formatSimpleDateTime,
} from "../dateUtils";

describe("dateUtils", () => {
  describe("formatDateTime", () => {
    it("应该格式化毫秒时间戳", () => {
      const timestamp = Date.now();
      const result = formatDateTime(timestamp);
      expect(result).not.toBe("未知时间");
      expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}/);
    });

    it("应该格式化秒级时间戳", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = formatDateTime(timestamp);
      expect(result).not.toBe("未知时间");
    });

    it("应该返回未知时间当时间戳无效时", () => {
      expect(formatDateTime(0)).toBe("未知时间");
      expect(formatDateTime(null)).toBe("未知时间");
      expect(formatDateTime(undefined)).toBe("未知时间");
      expect(formatDateTime(-1)).toBe("未知时间");
    });
  });

  describe("formatRelativeTime", () => {
    it("应该显示刚刚", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now)).toBe("刚刚");
    });

    it("应该显示分钟前", () => {
      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60;
      expect(formatRelativeTime(fiveMinutesAgo)).toContain("分钟前");
    });

    it("应该显示小时前", () => {
      const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
      expect(formatRelativeTime(twoHoursAgo)).toContain("小时前");
    });

    it("应该显示天前", () => {
      const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
      expect(formatRelativeTime(threeDaysAgo)).toContain("天前");
    });
  });

  describe("formatDateString", () => {
    it("应该格式化日期字符串", () => {
      const dateStr = "2024-01-15";
      const result = formatDateString(dateStr);
      expect(result).toContain("2024");
      expect(result).toContain("1");
      expect(result).toContain("15");
    });

    it("应该返回原字符串当日期无效时", () => {
      const invalidDate = "invalid-date";
      expect(formatDateString(invalidDate)).toBe(invalidDate);
    });
  });

  describe("formatStandardDateTime", () => {
    it("应该格式化日期字符串为标准格式", () => {
      const dateStr = "2024-01-15T14:30:00";
      const result = formatStandardDateTime(dateStr);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it("应该返回 - 当日期字符串为空时", () => {
      expect(formatStandardDateTime("")).toBe("-");
      expect(formatStandardDateTime(undefined)).toBe("-");
    });

    it("应该使用自定义解析函数", () => {
      const dateStr = "custom-format";
      const parseDate = (str: string) => {
        if (str === "custom-format") return Date.now();
        return null;
      };
      const result = formatStandardDateTime(dateStr, parseDate);
      expect(result).not.toBe("-");
    });
  });

  describe("formatFullDateTime", () => {
    it("应该格式化时间戳为完整日期时间", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = formatFullDateTime(timestamp);
      expect(result).toMatch(/\d{4}/);
    });

    it("应该支持自定义选项", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = formatFullDateTime(timestamp, {
        year: "2-digit",
        month: "long",
      });
      expect(result).toContain("年");
    });
  });

  describe("formatSimpleDateTime", () => {
    it("应该格式化时间戳为简单格式", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = formatSimpleDateTime(timestamp);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });
});

