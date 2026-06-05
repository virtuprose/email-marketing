import { ImportRowStatus } from "@prisma/client";

export type ImportMapping = {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  website?: string;
  role?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  source?: string;
  sourceUrl?: string;
  legalBasis?: string;
  consentNotes?: string;
  whatsappOptIn?: string;
  whatsappConsentSource?: string;
  tags?: string;
};

export type ImportFieldKey = keyof ImportMapping;

export type FieldDefinition = {
  key: ImportFieldKey;
  label: string;
  required?: boolean;
  aliases: string[];
};

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "email", label: "Email", required: true, aliases: ["email", "email address", "work email"] },
  {
    key: "phone",
    label: "Phone / WhatsApp",
    aliases: ["phone", "phone number", "mobile", "mobile phone", "whatsapp", "whatsapp number"]
  },
  { key: "firstName", label: "First name", aliases: ["first name", "firstname", "given name", "name"] },
  { key: "lastName", label: "Last name", aliases: ["last name", "lastname", "surname"] },
  { key: "company", label: "Company", aliases: ["company", "company name", "organization", "business"] },
  { key: "website", label: "Website", aliases: ["website", "url", "domain", "company website"] },
  { key: "role", label: "Role / title", aliases: ["role", "title", "job title", "position"] },
  { key: "industry", label: "Industry", aliases: ["industry", "category", "sector"] },
  { key: "country", label: "Country", aliases: ["country", "location", "region"] },
  { key: "timezone", label: "Timezone", aliases: ["timezone", "time zone"] },
  { key: "source", label: "Lead source", aliases: ["source", "lead source", "list source"] },
  { key: "sourceUrl", label: "Source URL", aliases: ["source url", "profile url", "linkedin", "lead url"] },
  {
    key: "legalBasis",
    label: "Legal basis",
    aliases: ["legal basis", "consent", "permission", "lawful basis"]
  },
  { key: "consentNotes", label: "Consent/source notes", aliases: ["consent notes", "notes", "source notes"] },
  {
    key: "whatsappOptIn",
    label: "WhatsApp opt-in",
    aliases: ["whatsapp opt in", "whatsapp opt-in", "wa opt in", "opted in whatsapp"]
  },
  {
    key: "whatsappConsentSource",
    label: "WhatsApp consent source",
    aliases: ["whatsapp consent source", "wa consent source", "whatsapp permission source"]
  },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "segment", "segments"] }
];

export type PreparedLead = {
  email: string;
  emailValid: boolean;
  phoneE164?: string;
  phoneValid: boolean;
  firstName?: string;
  lastName?: string;
  company?: string;
  website?: string;
  role?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  source?: string;
  sourceUrl?: string;
  legalBasis?: string;
  consentNotes?: string;
  whatsappOptIn: boolean;
  whatsappConsentSource?: string;
  tags: string[];
  issues: string[];
};

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePhoneE164(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : "+"}${digits}`;
}

export function isValidE164(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function parseBooleanish(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["yes", "y", "true", "1", "opted in", "opt-in", "allowed", "consented"].includes(normalized);
}

export function guessMapping(headers: string[]) {
  const mapping: Partial<ImportMapping> = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header)
  }));

  for (const field of FIELD_DEFINITIONS) {
    const match = normalizedHeaders.find((header) => field.aliases.includes(header.normalized));
    if (match) {
      mapping[field.key] = match.original;
    }
  }

  return mapping;
}

export function readMappedValue(row: Record<string, unknown>, mapping: ImportMapping, key: ImportFieldKey) {
  const column = mapping[key];
  if (!column) return "";
  const directValue = row[column];
  if (directValue !== undefined) return String(directValue ?? "").trim();

  const normalizedColumn = normalizeHeader(column);
  const matchedKey = Object.keys(row).find((rowKey) => normalizeHeader(rowKey) === normalizedColumn);
  return matchedKey ? String(row[matchedKey] ?? "").trim() : "";
}

function splitTags(value: string) {
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function buildPreparedLead(row: Record<string, unknown>, mapping: ImportMapping): PreparedLead {
  const email = normalizeEmail(readMappedValue(row, mapping, "email"));
  const phoneE164 = normalizePhoneE164(readMappedValue(row, mapping, "phone"));
  const firstName = readMappedValue(row, mapping, "firstName");
  const lastName = readMappedValue(row, mapping, "lastName");
  const company = readMappedValue(row, mapping, "company");
  const website = readMappedValue(row, mapping, "website");
  const role = readMappedValue(row, mapping, "role");
  const industry = readMappedValue(row, mapping, "industry");
  const country = readMappedValue(row, mapping, "country");
  const timezone = readMappedValue(row, mapping, "timezone");
  const source = readMappedValue(row, mapping, "source");
  const sourceUrl = readMappedValue(row, mapping, "sourceUrl");
  const legalBasis = readMappedValue(row, mapping, "legalBasis");
  const consentNotes = readMappedValue(row, mapping, "consentNotes");
  const whatsappOptIn = parseBooleanish(readMappedValue(row, mapping, "whatsappOptIn"));
  const whatsappConsentSource = readMappedValue(row, mapping, "whatsappConsentSource");
  const tags = splitTags(readMappedValue(row, mapping, "tags"));
  const issues: string[] = [];
  const emailValid = isValidEmail(email);
  const phoneValid = !phoneE164 || isValidE164(phoneE164);

  if (!emailValid) issues.push("Invalid email address");
  if (phoneE164 && !phoneValid) issues.push("Invalid WhatsApp phone number");
  if (phoneE164 && whatsappOptIn && !whatsappConsentSource) {
    issues.push("Missing WhatsApp consent source");
  }
  if (!country) issues.push("Missing country/region");
  if (!source) issues.push("Missing lead source");
  if (!legalBasis) issues.push("Missing legal basis");

  return {
    email,
    emailValid,
    phoneE164: phoneValid ? phoneE164 : undefined,
    phoneValid,
    firstName,
    lastName,
    company,
    website,
    role,
    industry,
    country,
    timezone,
    source,
    sourceUrl,
    legalBasis,
    consentNotes,
    whatsappOptIn,
    whatsappConsentSource,
    tags,
    issues
  };
}

export function classifyImportCandidate({
  prepared,
  seenInFile,
  seenPhonesInFile,
  existingEmails,
  existingPhones,
  suppressedEmails
}: {
  prepared: PreparedLead;
  seenInFile: Set<string>;
  seenPhonesInFile?: Set<string>;
  existingEmails: Set<string>;
  existingPhones?: Set<string>;
  suppressedEmails: Set<string>;
}) {
  const issues = [...prepared.issues];

  if (!prepared.emailValid || !prepared.phoneValid) {
    return {
      status: ImportRowStatus.INVALID,
      issues,
      shouldCreateLead: false
    };
  }

  if (
    prepared.phoneE164 &&
    (seenPhonesInFile?.has(prepared.phoneE164) || existingPhones?.has(prepared.phoneE164))
  ) {
    return {
      status: ImportRowStatus.DUPLICATE,
      issues: [...issues, "Duplicate WhatsApp phone"],
      shouldCreateLead: false
    };
  }

  if (seenInFile.has(prepared.email) || existingEmails.has(prepared.email)) {
    return {
      status: ImportRowStatus.DUPLICATE,
      issues: [...issues, "Duplicate email"],
      shouldCreateLead: false
    };
  }

  if (suppressedEmails.has(prepared.email)) {
    return {
      status: ImportRowStatus.SUPPRESSED,
      issues: [...issues, "Email is on suppression list"],
      shouldCreateLead: false
    };
  }

  const hasComplianceFlags = issues.some((issue) => issue.startsWith("Missing"));

  return {
    status: hasComplianceFlags ? ImportRowStatus.FLAGGED : ImportRowStatus.IMPORTED,
    issues,
    shouldCreateLead: true
  };
}

export function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  ) as Partial<T>;
}
