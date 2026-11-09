import { useState, type FormEvent } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryDto, CategoryNode } from '@myfinances/shared';
import { useCategoryLookup, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../hooks/queries';
import { CategoryIcon } from '../components/CategoryIcon';
import { Button, Card, ErrorMessage, Input, Spinner } from '../components/ui';

export function CategoriesPage() {
  const { tree, isLoading } = useCategoryLookup();
  const create = useCreateCategory();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366F1');

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function addTopLevel(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    create.mutate({ name: newName.trim(), color: newColor, icon: 'circle' }, { onSuccess: () => setNewName('') });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="text-sm text-slate-500">Organise expenses into categories and subcategories.</p>
      </div>

      <Card>
        <form onSubmit={addTopLevel} className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="size-9 cursor-pointer rounded-lg border-0 bg-transparent"
            aria-label="Colour"
          />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" maxLength={50} className="flex-1" />
          <Button type="submit" loading={create.isPending}>
            <Plus className="size-4" /> Add category
          </Button>
        </form>
        <div className="mt-3">
          <ErrorMessage error={create.error} />
        </div>
      </Card>

      <Card className="p-0 sm:p-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tree.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} open={expanded.has(cat.id)} onToggle={() => toggle(cat.id)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CategoryRow({ cat, open, onToggle }: { cat: CategoryNode; open: boolean; onToggle: () => void }) {
  const create = useCreateCategory();
  const [subName, setSubName] = useState('');

  function addSub(e: FormEvent) {
    e.preventDefault();
    if (!subName.trim()) return;
    create.mutate({ name: subName.trim(), parentId: cat.id }, { onSuccess: () => setSubName('') });
  }

  return (
    <li>
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={onToggle} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <CategoryIcon icon={cat.icon} color={cat.color} />
        <EditableName cat={cat} className="flex-1 font-medium" />
        <span className="text-xs text-slate-500">{cat.children.length} sub</span>
        <DeleteButton
          cat={cat}
          warning={`Delete "${cat.name}" and its ${cat.children.length} subcategories? Expenses keep their amounts but become uncategorized.`}
        />
      </div>
      {open && (
        <div className="space-y-1 pb-3 pr-4 pl-16">
          {cat.children.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="size-2 rounded-full" style={{ backgroundColor: sub.color ?? cat.color ?? '#94a3b8' }} />
              <EditableName cat={sub} className="flex-1 text-sm" />
              <DeleteButton cat={sub} warning={`Delete subcategory "${sub.name}"?`} />
            </div>
          ))}
          <form onSubmit={addSub} className="flex items-center gap-2 pt-1">
            <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder={`Add subcategory to ${cat.name}`} maxLength={50} className="flex-1 py-1.5" />
            <Button type="submit" variant="secondary" loading={create.isPending} className="py-1.5">
              <Plus className="size-4" /> Add
            </Button>
          </form>
          <ErrorMessage error={create.error} />
        </div>
      )}
    </li>
  );
}

function EditableName({ cat, className }: { cat: CategoryDto; className?: string }) {
  const update = useUpdateCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  if (!editing) {
    return (
      <span className={`group flex items-center gap-1.5 ${className ?? ''}`}>
        {cat.name}
        <button
          onClick={() => (setName(cat.name), setEditing(true))}
          className="rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 focus:opacity-100 dark:hover:bg-slate-800"
          aria-label={`Rename ${cat.name}`}
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }
  return (
    <form
      className={`flex items-center gap-1 ${className ?? ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ id: cat.id, input: { name: name.trim() } }, { onSuccess: () => setEditing(false) });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={50} className="py-1" />
      <button type="submit" className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="Save">
        <Check className="size-4" />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
        <X className="size-4" />
      </button>
      {update.error && <span className="text-xs text-rose-600">{(update.error as Error).message}</span>}
    </form>
  );
}

function DeleteButton({ cat, warning }: { cat: CategoryDto; warning: string }) {
  const remove = useDeleteCategory();
  return (
    <button
      onClick={() => confirm(warning) && remove.mutate(cat.id)}
      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
      aria-label={`Delete ${cat.name}`}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
