export type ComplianceSettings = {
  senderName?: string;
  senderEmail?: string;
  physicalAddress?: string;
  unsubscribeUrl?: string;
};

export const COMPLIANCE_SETTINGS_KEY = "compliance";

export function parseComplianceSettings(value: unknown): ComplianceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;

  return {
    senderName: typeof record.senderName === "string" ? record.senderName : undefined,
    senderEmail: typeof record.senderEmail === "string" ? record.senderEmail : undefined,
    physicalAddress: typeof record.physicalAddress === "string" ? record.physicalAddress : undefined,
    unsubscribeUrl: typeof record.unsubscribeUrl === "string" ? record.unsubscribeUrl : undefined
  };
}
