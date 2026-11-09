import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CalendarDays, Plus, Receipt, TrendingUp, Trophy } from 'lucide-react';
import { formatMoney, fromMinor } from '@myfinances/shared';
import { useWorkspace } from '../auth/AuthProvider';
import { useCategoryLookup, useExpenses, useSummary } from '../hooks/queries';
import { currentMonth, formatDay, monthRange, todayIso } from '../lib/dates';
import { ExpenseListItem } from '../components/ExpenseListItem';
import { MonthPicker } from '../components/MonthPicker';
import { Button, Card, Spinner } from '../components/ui';

export function DashboardPage() {
  const ws = useWorkspace();
  const [month, setMonth] = useState(currentMonth());
  const navigate = useNavigate();
  const { from, to, days } = monthRange(month);
  const summary = useSummary(from, to);
  const recent = useExpenses({ from, to, pageSize: 6 });
  const { byId } = useCategoryLookup();

  const money = (minor: number) => formatMoney(minor, ws.baseCurrency);
  const s = summary.data;

  // Average per day so far: for the current month only count days elapsed.
  const elapsed = month === currentMonth() ? Number(todayIso().slice(8, 10)) : days;
  const avgPerDay = s ? Math.round(s.totalMinor / Math.max(1, elapsed)) : 0;
  const top = s?.byCategory[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">{ws.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker value={month} onChange={setMonth} />
          <Button onClick={() => navigate('/expenses/new')}>
            <Plus className="size-4" /> <span className="hidden sm:inline">Add expense</span>
          </Button>
        </div>
      </div>

      {!s ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={TrendingUp} label="Total spent" value={money(s.totalMinor)} accent="bg-brand-600" />
            <StatCard icon={Receipt} label="Expenses" value={String(s.count)} accent="bg-emerald-500" />
            <StatCard icon={CalendarDays} label="Daily average" value={money(avgPerDay)} accent="bg-amber-500" />
            <StatCard icon={Trophy} label="Top category" value={top?.name ?? '—'} accent="bg-rose-500" />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <h3 className="mb-4 font-semibold">Daily spending</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={s.byDay.map((d) => ({ ...d, value: fromMinor(d.totalMinor, s.currency) }))}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => String(Number(d.slice(8)))}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      interval="preserveStartEnd"
                      stroke="#94a3b8"
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} stroke="#94a3b8" />
                    <Tooltip
                      cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                      formatter={(_v, _n, item) => [money(item.payload.totalMinor), 'Spent']}
                      labelFormatter={(d) => formatDay(String(d), { weekday: 'short', day: 'numeric', month: 'short' })}
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)' }}
                    />
                    <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <h3 className="mb-4 font-semibold">By category</h3>
              {s.byCategory.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
                  <div className="size-44 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={s.byCategory}
                          dataKey="totalMinor"
                          nameKey="name"
                          innerRadius="62%"
                          outerRadius="100%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {s.byCategory.map((c) => (
                            <Cell key={c.categoryId ?? 'none'} fill={c.color ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => money(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full space-y-2 text-sm">
                    {s.byCategory.slice(0, 6).map((c) => (
                      <li key={c.categoryId ?? 'none'} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color ?? '#94a3b8' }} />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="font-medium tabular-nums">
                          {Math.round((c.totalMinor / s.totalMinor) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Recent expenses</h3>
              <Link to="/expenses" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                View all <ArrowRight className="size-4" />
              </Link>
            </div>
            {recent.data?.items.length ? (
              <ul className="-mx-5 divide-y divide-slate-100 dark:divide-slate-800">
                {recent.data.items.map((e) => (
                  <ExpenseListItem key={e.id} expense={e} byId={byId} />
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No expenses this month yet.</p>
            )}
          </Card>
        </>
      )}

    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={`flex size-7 items-center justify-center rounded-lg text-white ${accent}`}>
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <p className="mt-3 truncate text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
    </Card>
  );
}

function EmptyChart() {
  return <p className="py-16 text-center text-sm text-slate-500">Nothing to show yet.</p>;
}
