import type { ReactNode } from 'react';
import { Clock, Laptop, Smartphone } from 'lucide-react';
import { describeClient, type ClientInfoDto, type UserRefDto } from '@myfinances/shared';
import { Card } from './ui';

/** Shared building blocks for the expense and income/investment editors. */

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

interface AuditRecord {
  /** Null once the author deleted their account. */
  createdBy: UserRefDto | null;
  createdAt: string;
  createdClient: ClientInfoDto | null;
  updatedBy: UserRefDto | null;
  updatedAt: string;
  updatedClient: ClientInfoDto | null;
}

export function AuditFooter({ record: expense }: { record: AuditRecord }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="space-y-1.5 px-1 text-xs text-slate-500">
      <AuditLine
        label="Added by"
        who={expense.createdBy ? expense.createdBy.displayName : 'a deleted user'}
        client={expense.createdClient}
        when={fmt(expense.createdAt)}
      />
      {expense.updatedBy && (
        <AuditLine
          label="Last edited by"
          who={expense.updatedBy.displayName}
          client={expense.updatedClient}
          when={fmt(expense.updatedAt)}
        />
      )}
    </div>
  );
}

function AuditLine({
  label,
  who,
  client,
  when,
}: {
  label: string;
  who: string | null;
  client: ClientInfoDto | null;
  when: string;
}) {
  const Icon = client?.type === 'ios' || client?.type === 'android' ? Smartphone : Laptop;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>
        {label} <span className="font-medium text-slate-700 dark:text-slate-300">{who ?? 'someone'}</span>
      </span>
      <span className="inline-flex items-center gap-1" title={client?.userAgent ?? undefined}>
        <Icon className="size-3.5" /> {describeClient(client)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" /> {when}
      </span>
    </p>
  );
}
