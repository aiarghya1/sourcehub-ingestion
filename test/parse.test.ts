import { describe, expect, it } from "vitest";
import { EmptyDatasetError, InvalidFormatError, parseCsv, parseJson } from "../src/ingestion/parse.js";

describe("parseCsv", () => {
  it("parses a well-formed row into aligned raw fields", () => {
    const csv = "a,b,c\n1,2,3\n";
    const { header, rows } = parseCsv(csv);
    expect(header).toEqual(["a", "b", "c"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.raw).toEqual({ a: "1", b: "2", c: "3" });
    expect(rows[0]!.malformed).toBe(false);
  });

  it("handles quoted fields with embedded commas, quotes, and newlines", () => {
    const csv = 'a,b\n"hello, world","say ""hi""\nnext line"\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]!.raw.a).toBe("hello, world");
    expect(rows[0]!.raw.b).toBe('say "hi"\nnext line');
    expect(rows[0]!.malformed).toBe(false);
  });

  it("flags rows with the wrong column count as malformed", () => {
    const csv = "a,b,c\n1,2\n1,2,3,4\n";
    const { rows } = parseCsv(csv);
    expect(rows[0]!.malformed).toBe(true);
    expect(rows[1]!.malformed).toBe(true);
  });

  it("throws on an empty dataset", () => {
    expect(() => parseCsv("   \n  ")).toThrow(EmptyDatasetError);
  });

  it("throws when there is a header but no data rows", () => {
    expect(() => parseCsv("a,b,c\n")).toThrow(EmptyDatasetError);
  });
});

describe("parseJson", () => {
  it("parses an array of objects using the union of keys", () => {
    const { header, rows } = parseJson('[{"a":1,"b":2},{"a":3,"c":4}]');
    expect(new Set(header)).toEqual(new Set(["a", "b", "c"]));
    expect(rows[0]!.raw.a).toBe("1");
  });

  it("rejects non-array JSON", () => {
    expect(() => parseJson('{"a":1}')).toThrow(InvalidFormatError);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJson("{not json")).toThrow(InvalidFormatError);
  });

  it("does not pollute Object.prototype via a __proto__ header key", () => {
    parseJson('[{"__proto__":"polluted","a":1}]');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // A __proto__ CSV header must not corrupt the prototype chain either.
    parseCsv("__proto__,a\nx,1\n");
    expect(Object.prototype).toBe(Object.getPrototypeOf({}));
  });
});
