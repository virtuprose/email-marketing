import { CsvImportClient } from "@/components/csv-import-client";
import { PageHeader } from "@/components/page-header";

export default function LeadImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="CSV Import"
        title="Import leads safely"
        description="Map your CSV columns, preview rows, and import leads with duplicate, suppression, and compliance-field checks."
      />
      <CsvImportClient />
    </>
  );
}
