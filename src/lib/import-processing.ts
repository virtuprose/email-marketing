import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  buildPreparedLead,
  classifyImportCandidate,
  compactObject,
  guessMapping,
  type ImportMapping,
  type PreparedLead
} from "@/lib/imports";
import { prisma } from "@/lib/prisma";

export const importMappingSchema = z.object({
  email: z.string().min(1),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  role: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  legalBasis: z.string().optional(),
  consentNotes: z.string().optional(),
  whatsappOptIn: z.string().optional(),
  whatsappConsentSource: z.string().optional(),
  tags: z.string().optional()
});

export type ImportCounters = {
  importedRows: number;
  invalidRows: number;
  duplicateRows: number;
  suppressedRows: number;
  flaggedRows: number;
};

export type ClassifiedImportRow = {
  index: number;
  rowNumber: number;
  row: Record<string, string>;
  email: string;
  phoneE164: string | null;
  status: "IMPORTED" | "FLAGGED" | "DUPLICATE" | "INVALID" | "SUPPRESSED";
  issues: string[];
  shouldCreateLead: boolean;
  prepared: PreparedLead;
};

export type ClassifiedImportRows = {
  headers: string[];
  rows: ClassifiedImportRow[];
  counters: ImportCounters;
  totalRows: number;
};

export function parseLeadImportText(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];

  return parse(normalized, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
    delimiter: firstLine(normalized).includes("\t") ? "\t" : ","
  }) as Record<string, string>[];
}

export function headersFromRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const header of Object.keys(row)) {
      if (header.trim()) seen.add(header);
    }
  }
  return [...seen];
}

export async function classifyLeadImportRows({
  rows,
  mapping,
  tx = prisma
}: {
  rows: Record<string, string>[];
  mapping: ImportMapping;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<ClassifiedImportRows> {
  const preparedRows = rows.map((row, index) => ({
    index,
    row,
    prepared: buildPreparedLead(row, mapping)
  }));

  const candidateEmails = preparedRows.map(({ prepared }) => prepared.email).filter(Boolean);
  const candidatePhones = preparedRows.map(({ prepared }) => prepared.phoneE164).filter(Boolean) as string[];

  const [existingLeads, existingPhoneLeads, suppressions] = await Promise.all([
    tx.lead.findMany({
      where: { email: { in: candidateEmails } },
      select: { email: true }
    }),
    tx.lead.findMany({
      where: { phoneE164: { in: candidatePhones } },
      select: { phoneE164: true }
    }),
    tx.suppressionEntry.findMany({
      where: { email: { in: candidateEmails } },
      select: { email: true }
    })
  ]);

  const existingEmails = new Set(existingLeads.map((lead) => lead.email));
  const existingPhones = new Set(
    existingPhoneLeads.map((lead) => lead.phoneE164).filter(Boolean) as string[]
  );
  const suppressedEmails = new Set(suppressions.map((entry) => entry.email));
  const seenInFile = new Set<string>();
  const seenPhonesInFile = new Set<string>();
  const counters = emptyImportCounters();
  const classifiedRows: ClassifiedImportRow[] = [];

  for (const { index, row, prepared } of preparedRows) {
    const classification = classifyImportCandidate({
      prepared,
      seenInFile,
      seenPhonesInFile,
      existingEmails,
      existingPhones,
      suppressedEmails
    });
    const { status, issues, shouldCreateLead } = classification;

    if (status === "INVALID") {
      counters.invalidRows += 1;
    } else if (status === "DUPLICATE") {
      counters.duplicateRows += 1;
    } else if (status === "SUPPRESSED") {
      counters.suppressedRows += 1;
    } else {
      seenInFile.add(prepared.email);
      if (prepared.phoneE164) seenPhonesInFile.add(prepared.phoneE164);
      counters.importedRows += 1;
      if (status === "FLAGGED") counters.flaggedRows += 1;
    }

    classifiedRows.push({
      index,
      rowNumber: index + 1,
      row,
      email: prepared.email,
      phoneE164: prepared.phoneE164 || null,
      status,
      issues,
      shouldCreateLead,
      prepared
    });
  }

  return {
    headers: headersFromRows(rows),
    rows: classifiedRows,
    counters,
    totalRows: rows.length
  };
}

export function previewPayload(result: ClassifiedImportRows, limit = 100) {
  return {
    headers: result.headers,
    totalRows: result.totalRows,
    counters: result.counters,
    rows: result.rows.slice(0, limit).map((row) => ({
      rowNumber: row.rowNumber,
      email: row.email,
      phoneE164: row.phoneE164,
      status: row.status,
      issues: row.issues,
      values: compactObject(row.row)
    }))
  };
}

export function defaultImportMappingForRows(rows: Record<string, string>[]) {
  return guessMapping(headersFromRows(rows));
}

function emptyImportCounters(): ImportCounters {
  return {
    importedRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    suppressedRows: 0,
    flaggedRows: 0
  };
}

function firstLine(text: string) {
  return text.split(/\r?\n/, 1)[0] ?? "";
}
