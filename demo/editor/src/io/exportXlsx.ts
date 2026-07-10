import * as XLSX from "xlsx";
import type { DaicePackage } from "@leoninestudios/daice-chain-core";
import { buildOverviewRows, OVERVIEW_COLUMNS } from "./exportOverview";

/** Exports a metadata-only overview of the package as a real `.xlsx` workbook (SheetJS), with no embedded media. */
export function exportOverviewXlsx(pkg: DaicePackage): void {
  const rows = buildOverviewRows(pkg);
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => Object.fromEntries(OVERVIEW_COLUMNS.map(({ key, label }) => [label, row[key]]))),
    { header: OVERVIEW_COLUMNS.map((c) => c.label) },
  );
  worksheet["!cols"] = OVERVIEW_COLUMNS.map(({ key }) => ({ wch: key === "prompt" ? 48 : 20 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Assets");
  XLSX.writeFile(workbook, `${pkg.package.packageName || pkg.package.id || "daice-chain-package"}-overview.xlsx`.replace(/[\\/:*?"<>|]+/g, "_"));
}
