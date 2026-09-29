import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMediaQuery } from '@/utils/hooks';

export interface NetworkImpact {
  network: string;
  trains: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: NetworkImpact }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-night-700/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-ink-50">{p.network}</p>
      <p className="mt-0.5 text-ink-300">
        <span className="font-mono text-ink-100">{p.trains}</span> circulation(s) impactée(s)
      </p>
    </div>
  );
}

/** Barres horizontales, une seule série (ampleur) : une teinte, pas de légende, tri décroissant. */
export function NetworkImpactChart({ data }: { data: NetworkImpact[] }) {
  const narrow = useMediaQuery('(max-width: 639px)');
  const height = Math.max(160, data.length * (narrow ? 26 : 30) + 30);
  return (
    <div style={{ height }} role="img" aria-label="Circulations impactées par réseau">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: narrow ? 30 : 40, bottom: 4, left: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="rgb(255 255 255 / 0.05)" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: '#667389', fontSize: 11 }} axisLine={false} tickLine={false} hide={narrow} />
          <YAxis
            type="category"
            dataKey="network"
            width={narrow ? 96 : 150}
            tick={{ fill: '#b8c2d3', fontSize: narrow ? 11 : 12 }}
            tickFormatter={(v: string) => (narrow && v.length > 14 ? `${v.slice(0, 13)}…` : v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} content={<ChartTooltip />} />
          <Bar dataKey="trains" fill="#4fd3ea" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={700}>
            <LabelList dataKey="trains" position="right" fill="#b8c2d3" fontSize={11} fontFamily="JetBrains Mono" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
