const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = () => isoDate(new Date());

export function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

export const currentMonth = () => todayIso().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return isoDate(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(days)}`, days };
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
