// === src/components/panel/stats/StatsTable.tsx ===
// v2 — wrap dans un conteneur scrollable horizontalement pour mobile.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export interface StatsColumn<T> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
}

interface Props<T> {
  rows: T[];
  columns: StatsColumn<T>[];
  pageSize?: number;
  emptyMessage?: string;
}

export function StatsTable<T extends Record<string, unknown>>({
  rows, columns, pageSize = 20, emptyMessage = "Aucune donnée",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const get = (row: T) =>
      col.sortValue ? col.sortValue(row) : (row[sortKey] as unknown);
    return [...rows].sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [rows, columns, sortKey, sortDir]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const slice = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string, sortable?: boolean) => {
    if (sortable === false) return;
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (rows.length === 0) {
    return (
      <div className="border-2 border-dashed border-border p-8 text-center">
        <p className="eyebrow text-muted-foreground">// {emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border-2 border-border">
      {/* Scroll horizontal sur mobile — la table reste lisible sans casser
          la page entière. */}
      <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="border-b-2 border-border bg-muted/30 hover:bg-muted/30">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => toggleSort(c.key, c.sortable)}
                  className={cn(
                    "eyebrow text-muted-foreground select-none whitespace-nowrap",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.sortable !== false && "cursor-pointer hover:text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable !== false && (
                      sortKey === c.key
                        ? sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                        : <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((row, i) => (
              <TableRow key={i} className="border-b border-border/60 hover:bg-muted/20">
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "mono text-xs whitespace-nowrap",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                    )}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 flex-wrap border-t-2 border-border px-3 py-2">
          <p className="mono text-[11px] text-muted-foreground">
            Page {safePage} / {pages} — {total} lignes
          </p>
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline"
              className="rounded-none border-2 mono text-xs"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >Précédent</Button>
            <Button
              size="sm" variant="outline"
              className="rounded-none border-2 mono text-xs"
              disabled={safePage >= pages}
              onClick={() => setPage(safePage + 1)}
            >Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StatsTable;
