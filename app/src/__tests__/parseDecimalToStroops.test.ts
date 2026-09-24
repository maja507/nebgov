import { parseDecimalToStroops } from "@/lib/parseDecimalToStroops";

describe("parseDecimalToStroops", () => {
  it("parses whole numbers", () => {
    expect(parseDecimalToStroops("10", 1000)).toBe(BigInt(10000));
  });

  it("parses decimals with allowed precision", () => {
    expect(parseDecimalToStroops("1.5", 100)).toBe(BigInt(150));
  });

  it("rejects too many decimal places", () => {
    const res = parseDecimalToStroops("1.123", 100);
    expect(res).toBeInstanceOf(Error);
  });

  it("rejects invalid strings", () => {
    const res = parseDecimalToStroops("abc", 1000);
    expect(res).toBeInstanceOf(Error);
  });
});
