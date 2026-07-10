import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DaicePackage } from "@daice-chain/core";
import { buildOverviewRows, OVERVIEW_COLUMNS } from "./exportOverview";

/** Exports a metadata-only overview of the package as a `.pdf` (jsPDF + autotable), with no embedded media. */
export function exportOverviewPdf(pkg: DaicePackage): void {
  const rows = buildOverviewRows(pkg);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });

  doc.setFontSize(14);
  doc.text(pkg.package.packageName || pkg.package.id, 40, 36);
  doc.setFontSize(9);
  doc.text(
    `Created by ${pkg.package.createdBy.name} · ${pkg.package.createdAt} · ${pkg.assets.length} asset(s)`,
    40,
    52,
  );

  autoTable(doc, {
    startY: 66,
    head: [OVERVIEW_COLUMNS.map((c) => c.label)],
    body: rows.map((row) => OVERVIEW_COLUMNS.map(({ key }) => row[key])),
    styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [24, 24, 27] },
    columnStyles: { 4: { cellWidth: 160 } }, // prompt column, wider
  });

  doc.save(`${pkg.package.packageName || pkg.package.id || "daice-chain-package"}-overview.pdf`.replace(/[\\/:*?"<>|]+/g, "_"));
}
