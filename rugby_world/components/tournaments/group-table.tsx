import type { Pool } from "@/lib/types";

const num = "w-12 px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const head = `${num} text-[11px] font-semibold tracking-wide text-muted-foreground uppercase`;

export function GroupStandingsTable({ pool }: { pool: Pool }) {
  if (pool.standings.length === 0) {
    return <p className="text-sm text-muted-foreground">No teams in this group.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="w-8 px-2 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              #
            </th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Team
            </th>
            <th className={head}>P</th>
            <th className={head}>W</th>
            <th className={head}>D</th>
            <th className={head}>L</th>
            <th className={head}>PF</th>
            <th className={head}>PA</th>
            <th className={head}>PD</th>
            <th className={head}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {pool.standings.map((row, index) => {
            const diff = row.pointsFor - row.pointsAgainst;
            return (
              <tr key={row.team} className="border-t">
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-1.5 font-medium whitespace-nowrap text-navy">
                  {row.flag} {row.team}
                </td>
                <td className={num}>{row.played}</td>
                <td className={num}>{row.won}</td>
                <td className={num}>{row.drawn}</td>
                <td className={num}>{row.lost}</td>
                <td className={num}>{row.pointsFor}</td>
                <td className={num}>{row.pointsAgainst}</td>
                <td className={num}>{diff > 0 ? `+${diff}` : diff}</td>
                <td className={`${num} font-semibold text-navy`}>{row.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
