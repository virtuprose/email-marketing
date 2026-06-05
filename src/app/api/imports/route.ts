import { LeadEventType, LeadStatus, Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPreparedLead, classifyImportCandidate, compactObject, type ImportMapping } from "@/lib/imports";
import { prisma } from "@/lib/prisma";

const mappingSchema = z.object({
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

function parseCsv(text: string) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true
  }) as Record<string, string>[];
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const mappingRaw = formData.get("mapping");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  const mapping = mappingSchema.parse(JSON.parse(String(mappingRaw ?? "{}"))) as ImportMapping;
  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV has no rows to import." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        filename: file.name || "lead-import.csv",
        totalRows: rows.length
      }
    });

    const preparedRows = rows.map((row, index) => ({
      index,
      row,
      prepared: buildPreparedLead(row, mapping)
    }));

    const candidateEmails = preparedRows.map(({ prepared }) => prepared.email).filter(Boolean);
    const candidatePhones = preparedRows
      .map(({ prepared }) => prepared.phoneE164)
      .filter(Boolean) as string[];

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
    const counters = {
      importedRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      suppressedRows: 0,
      flaggedRows: 0
    };

    for (const { index, row, prepared } of preparedRows) {
      const classification = classifyImportCandidate({
        prepared,
        seenInFile,
        seenPhonesInFile,
        existingEmails,
        existingPhones,
        suppressedEmails
      });
      const { issues, status } = classification;
      let leadId: string | undefined;

      if (status === "INVALID") {
        counters.invalidRows += 1;
      } else if (status === "DUPLICATE") {
        counters.duplicateRows += 1;
      } else if (status === "SUPPRESSED") {
        counters.suppressedRows += 1;
      } else {
        seenInFile.add(prepared.email);
        if (prepared.phoneE164) seenPhonesInFile.add(prepared.phoneE164);

        const lead = await tx.lead.create({
          data: {
            email: prepared.email,
            phoneE164: prepared.phoneE164 || null,
            firstName: prepared.firstName || null,
            lastName: prepared.lastName || null,
            company: prepared.company || null,
            website: prepared.website || null,
            role: prepared.role || null,
            industry: prepared.industry || null,
            country: prepared.country || null,
            timezone: prepared.timezone || null,
            source: prepared.source || null,
            sourceUrl: prepared.sourceUrl || null,
            legalBasis: prepared.legalBasis || null,
            consentNotes: prepared.consentNotes || null,
            whatsappOptIn: prepared.whatsappOptIn,
            whatsappConsentSource: prepared.whatsappConsentSource || null,
            whatsappStatus: prepared.phoneE164
              ? prepared.whatsappOptIn
                ? "OPTED_IN"
                : "UNKNOWN"
              : "UNKNOWN",
            status: status === "FLAGGED" ? LeadStatus.NEW : LeadStatus.VALIDATED,
            tags: {
              create: prepared.tags.map((name) => ({ name }))
            },
            events: {
              create: {
                type: LeadEventType.IMPORTED,
                message:
                  status === "FLAGGED"
                    ? "Imported with missing compliance fields"
                    : "Imported and validated for Phase 1",
                metadata: { importBatchId: batch.id, issues }
              }
            }
          }
        });

        leadId = lead.id;
        counters.importedRows += 1;
        if (status === "FLAGGED") counters.flaggedRows += 1;
      }

      await tx.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber: index + 1,
          raw: row as Prisma.InputJsonObject,
          email: prepared.email || null,
          phoneE164: prepared.phoneE164 || null,
          status,
          issues,
          leadId
        }
      });
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: counters
    });

    await tx.auditLog.create({
      data: {
        action: "import.completed",
        entityType: "import_batch",
        entityId: batch.id,
        metadata: compactObject({
          filename: file.name,
          totalRows: rows.length,
          ...counters
        })
      }
    });

    return { id: batch.id, ...counters, totalRows: rows.length };
  });

  return NextResponse.json(result);
}
