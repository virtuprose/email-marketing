import { ImportRowStatus } from "@prisma/client";

export type ImportMapping = {
  email: string;
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
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "segment", "segments"] }
];

export type PreparedLead = {
  email: string;
  emailValid: boolean;
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
  const tags = splitTags(readMappedValue(row, mapping, "tags"));
  const issues: string[] = [];
  const emailValid = isValidEmail(email);

  if (!emailValid) issues.push("Invalid email address");
  if (!country) issues.push("Missing country/region");
  if (!source) issues.push("Missing lead source");
  if (!legalBasis) issues.push("Missing legal basis");

  return {
    email,
    emailValid,
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
    tags,
    issues
  };
}

export function classifyImportCandidate({
  prepared,
  seenInFile,
  existingEmails,
  suppressedEmails
}: {
  prepared: PreparedLead;
  seenInFile: Set<string>;
  existingEmails: Set<string>;
  suppressedEmails: Set<string>;
}) {
  const issues = [...prepared.issues];

  if (!prepared.emailValid) {
    return {
      status: ImportRowStatus.INVALID,
      issues,
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
