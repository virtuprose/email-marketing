import { LeadEventType, LeadStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { compactObject } from "@/lib/imports";
import { classifyLeadImportRows, importMappingSchema, parseLeadImportText } from "@/lib/import-processing";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const mappingRaw = formData.get("mapping");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  const rawMapping = parseMappingJson(mappingRaw);
  const parsedMapping = importMappingSchema.safeParse(rawMapping);
  if (!parsedMapping.success) {
    return NextResponse.json({ error: "Map an email column before importing." }, { status: 400 });
  }

  const mapping = parsedMapping.data;
  const text = await file.text();
  const rows = parseLeadImportText(text);

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

    const classification = await classifyLeadImportRows({ rows, mapping, tx });

    for (const classifiedRow of classification.rows) {
      const { row, issues, status } = classifiedRow;
      let leadId: string | undefined;

      if (classifiedRow.shouldCreateLead) {
        const { prepared } = classifiedRow;
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
      }

      await tx.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber: classifiedRow.rowNumber,
          raw: row as Prisma.InputJsonObject,
          email: classifiedRow.email || null,
          phoneE164: classifiedRow.phoneE164,
          status,
          issues,
          leadId
        }
      });
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: classification.counters
    });

    await tx.auditLog.create({
      data: {
        action: "import.completed",
        entityType: "import_batch",
        entityId: batch.id,
        metadata: compactObject({
          filename: file.name,
          totalRows: rows.length,
          ...classification.counters
        })
      }
    });

    return { id: batch.id, ...classification.counters, totalRows: rows.length };
  });

  return NextResponse.json(result);
}

function parseMappingJson(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch {
    return {};
  }
}
