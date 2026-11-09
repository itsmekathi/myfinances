import { Plus, Trash2 } from 'lucide-react';
import { formatMoney, itemAmountMinor, toMinor } from '@myfinances/shared';

/** One row as typed in the form (strings so partial input like "1." is allowed). */
export interface ItemDraft {
  key: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

export const newItem = (): ItemDraft => ({
  key: crypto.randomUUID(),
  name: '',
  quantity: '1',
  unitPrice: '',
});

/** Rows that have a name and a valid price, converted for the API. */
export function itemsForApi(items: ItemDraft[], currency: string) {
  return items
    .filter((i) => i.name.trim() && i.unitPrice !== '' && Number(i.unitPrice) >= 0)
    .map((i) => ({
      name: i.name.trim(),
      quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
      unitPriceMinor: toMinor(Number(i.unitPrice), currency),
    }));
}

const cell =
  'w-full rounded-md border-0 bg-transparent px-2 py-1.5 text-sm ring-1 ring-transparent hover:ring-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:hover:ring-slate-700';

export function ItemsEditor({
  items,
  onChange,
  currency,
}: {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  currency: string;
}) {
  const update = (key: string, patch: Partial<ItemDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const total = itemsForApi(items, currency).reduce((s, i) => s + itemAmountMinor(i), 0);

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="w-20 px-3 py-2">Qty</th>
                <th className="w-32 px-3 py-2">Unit price</th>
                <th className="w-28 px-3 py-2 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, idx) => {
                const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
                const price = item.unitPrice === '' ? 0 : toMinor(Number(item.unitPrice) || 0, currency);
                return (
                  <tr key={item.key}>
                    <td className="px-1 py-1">
                      <input
                        className={cell}
                        value={item.name}
                        placeholder={idx === 0 ? 'e.g. Milk 1L' : 'Item name'}
                        maxLength={120}
                        onChange={(e) => update(item.key, { name: e.target.value })}
                        aria-label="Item name"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className={cell}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => update(item.key, { quantity: e.target.value })}
                        aria-label="Quantity"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className={cell}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        placeholder="0.00"
                        onChange={(e) => update(item.key, { unitPrice: e.target.value })}
                        aria-label="Unit price"
                      />
                    </td>
                    <td className="px-3 py-1 text-right font-medium tabular-nums">
                      {formatMoney(Math.round(qty * price), currency)}
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => onChange(items.filter((i) => i.key !== item.key))}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(total, currency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
      >
        <Plus className="size-4" /> {items.length ? 'Add item' : 'Add item breakdown'}
      </button>
    </div>
  );
}
