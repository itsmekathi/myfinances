import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildCategoryTree,
  type CreateCategoryInput,
  type CreateExpenseInput,
  type UpdateCategoryInput,
  type UpdateExpenseInput,
} from '@myfinances/shared';
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

/** Categories plus quick lookups: tree of top-level categories and a map by id. */
export function useCategoryLookup() {
  const { data: categories = [], ...rest } = useCategories();
  const value = useMemo(
    () => ({
      tree: buildCategoryTree(categories),
      byId: new Map(categories.map((c) => [c.id, c])),
    }),
    [categories],
  );
  return { ...value, categories, ...rest };
}

export function useExpenses(params: ExpenseListParams) {
  const ws = useWorkspace();
  return useQuery({
    queryKey: ['expenses', ws.id, params],
    queryFn: () => api.expenses.list(ws.id, params),
    placeholderData: keepPreviousData,
  });
}

export function useExpense(id: string | undefined) {
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

function useInvalidateExpenseData() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  return () =>
    Promise.all(
      ['expenses', 'expense', 'stats'].map((k) => qc.invalidateQueries({ queryKey: [k, ws.id] })),
    );
}

export function useSaveExpense() {
  const ws = useWorkspace();
  const invalidate = useInvalidateExpenseData();
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
  const invalidate = useInvalidateExpenseData();
  return useMutation({
    mutationFn: (id: string) => api.expenses.remove(ws.id, id),
    onSuccess: invalidate,
  });
}

export function useUploadAttachment() {
  const ws = useWorkspace();
  const invalidate = useInvalidateExpenseData();
  return useMutation({
    mutationFn: (args: { expenseId: string; file: File }) =>
      api.attachments.upload(ws.id, args.expenseId, args.file),
    onSuccess: invalidate,
  });
}

export function useDeleteAttachment() {
  const ws = useWorkspace();
  const invalidate = useInvalidateExpenseData();
  return useMutation({
    mutationFn: (args: { expenseId: string; id: string }) =>
      api.attachments.remove(ws.id, args.expenseId, args.id),
    onSuccess: invalidate,
  });
}

function useCategoryMutation<T>(fn: (wsId: string, arg: T) => Promise<unknown>) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: T) => fn(ws.id, arg),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['categories', ws.id] }),
        qc.invalidateQueries({ queryKey: ['stats', ws.id] }),
      ]),
  });
}

export const useCreateCategory = () =>
  useCategoryMutation((wsId, input: CreateCategoryInput) => api.categories.create(wsId, input));

export const useUpdateCategory = () =>
  useCategoryMutation((wsId, a: { id: string; input: UpdateCategoryInput }) =>
    api.categories.update(wsId, a.id, a.input),
  );

export const useDeleteCategory = () =>
  useCategoryMutation((wsId, id: string) => api.categories.remove(wsId, id));
