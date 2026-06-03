import { Check } from "lucide-react";
import type { CompareRow } from "@/lib/comparisons";

/** Side-by-side feature table: OpenBroca vs a competitor. */
export function ComparisonTable({
  competitorName,
  rows,
}: {
  competitorName: string;
  rows: CompareRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-bg-elevated/60">
            <th
              scope="col"
              className="w-1/3 px-5 py-4 font-medium text-white/55"
            >
              Feature
            </th>
            <th
              scope="col"
              className="px-5 py-4 font-semibold text-brand"
            >
              OpenBroca
            </th>
            <th
              scope="col"
              className="px-5 py-4 font-semibold text-white/80"
            >
              {competitorName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension} className="border-t border-line">
              <th
                scope="row"
                className="px-5 py-4 align-top font-medium text-white/70"
              >
                {row.dimension}
              </th>
              <td className="px-5 py-4 align-top text-white/85">
                <span className="flex items-start gap-2">
                  {row.edge && (
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-brand"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  )}
                  <span>{row.openbroca}</span>
                </span>
              </td>
              <td className="px-5 py-4 align-top text-white/55">
                {row.competitor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
