/** USPS abbreviations for the 50 states, DC, and the tax-relevant US territories. */
export const US_STATES = new Set<string>([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "GU", "VI", "AS", "MP",
]);

/** Filing frequencies we recognize, mapped from common spellings to a canonical label. */
export const FILING_FREQUENCIES: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  annually: "Annual",
  yearly: "Annual",
  "semi-annual": "Semi-Annual",
  semiannual: "Semi-Annual",
  semiannually: "Semi-Annual",
  weekly: "Weekly",
  occasional: "Occasional",
};

/** Truthy/falsy spellings accepted for the nexus indicator. */
const NEXUS_TRUE = new Set(["yes", "y", "true", "t", "1"]);
const NEXUS_FALSE = new Set(["no", "n", "false", "f", "0"]);

export function parseNexus(value: string): boolean | null | "ambiguous" {
  const v = value.trim().toLowerCase();
  if (v === "") return null;
  if (NEXUS_TRUE.has(v)) return true;
  if (NEXUS_FALSE.has(v)) return false;
  return "ambiguous";
}
