import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildCategoryTree, type CreateExpenseInput, type UpdateExpenseInput } from '@myfinances/shared';
import type { UploadFile } from '@myfinances/api-client';
import type { ExpenseListParams } from '@myfinances/api-client';
import { api } from '../lib/api';
import { useWorkspace } from '../auth/AuthProvider';

export function useCategories() {
  const ws = useWorkspace();
  return useQuery({
    queryKey: ['categories', ws.id],
    queryFn: () => api.categories.list(ws.id),
    staleTime: 5 * 60_000,
  });
}

export function useExpenses(params: ExpenseListParams) {
  const ws = useWorkspace();
  return useQuery({
    queryKey: ['expenses', ws.id, params],
    queryFn: () => api.expenses.list(ws.id, params),
    placeholderData: keepPreviousData,
  });
}

export function useExpense(id?: string) {
  const ws = useWorkspace();
  return useQuery({
    queryKey: ['expense', ws.id, id],
    queryFn: () => api.expenses.get(ws.id, id!),
    enabled: Boolean(id),
  });
}

export function useSummary(from: string, to: string) {
  const ws = useWorkspace();
  return useQuery({
    queryKey: ['stats', ws.id, from, to],
    queryFn: () => api.stats.summary(ws.id, from, to),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  return () =>
    Promise.all(
      ['expenses', 'expense', 'stats'].map((k) => qc.invalidateQueries({ queryKey: [k, ws.id] })),
    );
}

export function useSaveExpense() {
  const ws = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { id?: string; input: CreateExpenseInput | UpdateExpenseInput }) =>
      args.id
        ? api.expenses.update(ws.id, args.id, args.input)
        : api.expenses.create(ws.id, args.input as CreateExpenseInput),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const ws = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.expenses.remove(ws.id, id),
    onSuccess: invalidate,
  });
}

export function useCategoryLookup() {
  const { data: categories = [], ...rest } = useCategories();
  const value = useMemo(
    () => ({ tree: buildCategoryTree(categories), byId: new Map(categories.map((c) => [c.id, c])) }),
    [categories],
  );
  return { ...value, categories, ...rest };
}

export function useUploadAttachment() {
  const ws = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { expenseId: string; file: UploadFile }) =>
      api.attachments.upload(ws.id, args.expenseId, args.file),
    onSuccess: invalidate,
  });
}

export function useDeleteAttachment() {
  const ws = useWorkspace();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { expenseId: string; id: string }) => api.attachments.remove(ws.id, args.expenseId, args.id),
    onSuccess: invalidate,
  });
}
