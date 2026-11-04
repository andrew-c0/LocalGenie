import { describe, expect, it } from "vitest";
import { clampPage, pageCountOf, pageOf, rangeLabelOf } from "./pagination";

const items = Array.from({ length: 34 }, (_, i) => i + 1);

describe("pageCountOf", () => {
  it("rounds up to whole pages", () => {
    expect(pageCountOf(34, 10)).toBe(4);
    expect(pageCountOf(30, 10)).toBe(3);
    expect(pageCountOf(1, 10)).toBe(1);
  });

  it("keeps one page for an empty list", () => {
    expect(pageCountOf(0, 10)).toBe(1);
  });
});

describe("clampPage", () => {
  it("keeps a page inside the range", () => {
    expect(clampPage(0, 34, 10)).toBe(1);
    expect(clampPage(2, 34, 10)).toBe(2);
    expect(clampPage(9, 34, 10)).toBe(4);
  });

  it("moves back to the last page when the list shrinks below the page", () => {
    expect(clampPage(4, 10, 10)).toBe(1);
  });
});

describe("pageOf", () => {
  it("gives the first page", () => {
    expect(pageOf(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("gives a middle page", () => {
    expect(pageOf(items, 2, 10)[0]).toBe(11);
  });

  it("gives the short last page", () => {
    expect(pageOf(items, 4, 10)).toEqual([31, 32, 33, 34]);
  });

  it("shows the last page for a page past the end", () => {
    expect(pageOf(items, 99, 10)).toEqual([31, 32, 33, 34]);
  });

  it("gives nothing for an empty list", () => {
    expect(pageOf([], 1, 10)).toEqual([]);
  });
});

describe("rangeLabelOf", () => {
  it("shows the range of a full page", () => {
    expect(rangeLabelOf(34, 1, 10)).toBe("1-10 of 34");
  });

  it("shows the range of the short last page", () => {
    expect(rangeLabelOf(34, 4, 10)).toBe("31-34 of 34");
  });

  it("shows zero for an empty list", () => {
    expect(rangeLabelOf(0, 1, 10)).toBe("0 of 0");
  });
});
