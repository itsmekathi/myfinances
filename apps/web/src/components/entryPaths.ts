import type { EntryKind } from '@myfinances/shared';

/** Web route for each entry kind (matches the API path). */
export const entryPath = (kind: EntryKind) => (kind === 'income' ? '/income' : '/investments');
