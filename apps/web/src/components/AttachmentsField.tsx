import { useEffect, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { ATTACHMENT_LIMITS, type AttachmentDto } from '@myfinances/shared';
import { api } from '../lib/api';
import { useWorkspace } from '../auth/AuthProvider';

const ACCEPT = ATTACHMENT_LIMITS.mimeTypes.join(',');

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Checks a file before upload; returns an error message or null. */
export function validateFile(file: File): string | null {
  // Some browsers report HEIC photos with an empty type; the server checks the real content anyway.
  const heicByName = !file.type && /\.(heic|heif)$/i.test(file.name);
  if (!heicByName && !(ATTACHMENT_LIMITS.mimeTypes as readonly string[]).includes(file.type)) {
    return `${file.name}: only images (JPEG, PNG, WebP, HEIC) and PDFs are allowed`;
  }
  if (file.size > ATTACHMENT_LIMITS.maxBytes) return `${file.name}: larger than 10 MB`;
  return null;
}

/**
 * Shows saved attachments plus files queued for upload.
 * Saved ones are fetched with the auth header and shown via object URLs.
 */
export function AttachmentsField({
  expenseId,
  saved,
  pending,
  onAddFiles,
  onRemovePending,
  onRemoveSaved,
  busy,
}: {
  expenseId?: string;
  saved: AttachmentDto[];
  pending: File[];
  onAddFiles: (files: File[]) => void;
  onRemovePending: (file: File) => void;
  onRemoveSaved: (att: AttachmentDto) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = saved.length + pending.length >= ATTACHMENT_LIMITS.maxPerExpense;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!full) onAddFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="space-y-3">
      {(saved.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {saved.map((a) => (
            <SavedTile key={a.id} expenseId={expenseId!} att={a} onRemove={() => onRemoveSaved(a)} />
          ))}
          {pending.map((f, i) => (
            <PendingTile key={`${f.name}-${i}`} file={f} onRemove={() => onRemovePending(f)} />
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !full && inputRef.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition',
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-slate-200 hover:border-brand-500 dark:border-slate-700',
          full && 'pointer-events-none opacity-50',
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin text-brand-600" /> : <Paperclip className="size-5 text-slate-400" />}
        <span className="font-medium">Drop bills or receipts here, or click to browse</span>
        <span className="text-xs text-slate-500">Images or PDF · up to 10 MB each · max {ATTACHMENT_LIMITS.maxPerExpense}</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function Tile({
  name,
  meta,
  previewUrl,
  isPdf,
  onOpen,
  onRemove,
  dimmed,
}: {
  name: string;
  meta: string;
  previewUrl?: string;
  isPdf: boolean;
  onOpen?: () => void;
  onRemove: () => void;
  dimmed?: boolean;
}) {
  return (
    <div className={clsx('group relative overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-800', dimmed && 'opacity-70')}>
      <button type="button" onClick={onOpen} className="block w-full text-left" disabled={!onOpen}>
        <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 dark:bg-slate-800">
          {previewUrl && !isPdf ? (
            <img src={previewUrl} alt={name} className="size-full object-cover" />
          ) : (
            <FileText className="size-10 text-slate-400" />
          )}
        </div>
        <div className="px-2.5 py-2">
          <p className="truncate text-xs font-medium">{name}</p>
          <p className="text-[11px] text-slate-500">{meta}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full bg-slate-900/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        aria-label={`Remove ${name}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function SavedTile({ expenseId, att, onRemove }: { expenseId: string; att: AttachmentDto; onRemove: () => void }) {
  const ws = useWorkspace();
  const [url, setUrl] = useState<string>();
  const isPdf = att.mimeType === 'application/pdf';
  const canPreview = !isPdf && att.mimeType !== 'image/heic' && att.mimeType !== 'image/heif';

  useEffect(() => {
    if (!canPreview) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    api.attachments
      .download(ws.id, expenseId, att.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ws.id, expenseId, att.id, canPreview]);

  async function open() {
    const blob = await api.attachments.download(ws.id, expenseId, att.id);
    const href = URL.createObjectURL(blob);
    window.open(href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }

  return (
    <Tile
      name={att.fileName}
      meta={formatBytes(att.sizeBytes)}
      previewUrl={url}
      isPdf={!canPreview}
      onOpen={() => void open()}
      onRemove={onRemove}
    />
  );
}

function PendingTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>();
  const isImage = file.type.startsWith('image/') && !file.type.includes('hei');
  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);
  return (
    <Tile
      name={file.name}
      meta={`${formatBytes(file.size)} · will upload on save`}
      previewUrl={url}
      isPdf={!isImage}
      onRemove={onRemove}
      dimmed
    />
  );
}
