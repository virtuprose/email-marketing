import { CsvImportClient } from "@/components/csv-import-client";
import { PageHeader } from "@/components/page-header";

export default function LeadImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Add Leads"
        title="Upload leads safely"
        description="Match your CSV columns, preview rows, and add leads with duplicate, do-not-contact, and permission checks."
      />
      <CsvImportClient />
    </>
  );
}
