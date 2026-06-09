import { NextResponse } from "next/server";
import { z } from "zod";
import {
  classifyLeadImportRows,
  defaultImportMappingForRows,
  importMappingSchema,
  parseLeadImportText,
  previewPayload
} from "@/lib/import-processing";

const previewSchema = z.object({
  text: z.string().min(1),
  mapping: importMappingSchema.optional()
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Paste rows with a header row before checking." }, { status: 400 });
  }

  const rows = parseLeadImportText(parsed.data.text);
  if (!rows.length) {
    return NextResponse.json(
      { error: "No lead rows found. Keep the first row as column titles." },
      { status: 400 }
    );
  }

  const mapping = parsed.data.mapping ?? defaultImportMappingForRows(rows);
  const mappingResult = importMappingSchema.safeParse(mapping);
  if (!mappingResult.success) {
    return NextResponse.json(
      {
        error: "Map an email column before checking.",
        headers: Object.keys(rows[0] ?? {}),
        mapping
      },
      { status: 400 }
    );
  }

  const result = await classifyLeadImportRows({ rows, mapping: mappingResult.data });
  return NextResponse.json({
    ...previewPayload(result),
    mapping: mappingResult.data
  });
}
