export type PaymentLocation = "City Hall" | "Central" | "Online";
export type StaffLocation = "City Hall" | "Central";

export const PAYMENT_LOCATION_LABELS: Record<PaymentLocation, string> = {
  "City Hall": "City Hall",
  Central: "Central (MTPB)",
  Online: "Online (GCash)",
};

export const PAYMENT_LOCATION_OPTIONS: PaymentLocation[] = ["City Hall", "Central", "Online"];

const isGcash = (method: unknown): boolean =>
  String(method ?? "").toLowerCase().replace(/\s+/g, "") === "gcash";


export const derivePaymentLocation = (
  method: unknown,
  paymentLocation: unknown
): PaymentLocation => {
  if (isGcash(method)) return "Online";
  const v = String(paymentLocation ?? "").toLowerCase();
  if (v.includes("online") || v.includes("gcash")) return "Online";
  if (v.includes("city") || v.includes("hall")) return "City Hall";
  if (v.includes("central") || v.includes("mtpb")) return "Central";
  return "Central";
};

export const isInStaffScope = (
  staffLocation: StaffLocation | null,
  paymentLocation: PaymentLocation
): boolean => {
  if (!staffLocation) return true; 
  if (staffLocation === "City Hall") return paymentLocation === "City Hall";
  return paymentLocation === "Central" || paymentLocation === "Online";
};

export const staffScopeLabel = (staffLocation: StaffLocation): string =>
  staffLocation === "City Hall" ? "City Hall" : "Central (MTPB) + Online (GCash)";