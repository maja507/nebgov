export function parseDecimalToStroops(value: string, divisor: number): bigint | Error {
  if (!value || typeof value !== "string") return new Error("Invalid input");
  const trimmed = value.trim();
  if (trimmed === "") return new Error("Amount is required");

  // Allow only digits and at most one decimal point
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return new Error("Invalid number format");

  const parts = trimmed.split(".");
  const whole = parts[0];
  const frac = parts[1] || "";

  if (frac.length > Math.log10(divisor)) {
    return new Error("Too many decimal places");
  }

  const wholeStroops = BigInt(whole) * BigInt(divisor);
  const fracPadded = frac.padEnd(Math.log10(divisor), "0");
  const fracStroops = BigInt(fracPadded || "0");

  return wholeStroops + fracStroops;
}
