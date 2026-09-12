import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from 'lucide-react';
import { get, put } from '../../lib/api';
import { useApp } from '../../store/app';
import { Spinner } from '../ui';
import { TagPresetsCard } from './RolesTab';

type ListPreset = { title: string };

export function BoardDefaultsTab({ canManageTags }: { canManageTags: boolean }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Board defaults</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          Configure what newly created boards start with. Existing boards are never changed by
          edits made here.
        </p>
      </div>
      <DefaultListsCard />
      {canManageTags && <TagPresetsCard />}
    </div>
  );
}

function DefaultListsCard() {
  const { toast } = useApp();
  const [lists, setLists] = useState<ListPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get<{ lists: ListPreset[] }>('/api/admin/board-defaults')
      .then((result) => setLists(result.lists))
      .catch((err) => toast({ title: err.message || 'Could not load board defaults', tone: 'error' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const save = async (next: ListPreset[]) => {
    const cleaned = next.map((list, index) => ({
      title: list.title.trim() || `List ${index + 1}`,
    }));
    setLists(cleaned);
    setSaving(true);
    try {
      await put('/api/admin/board-defaults', { lists: cleaned });
    } catch (err: any) {
      toast({ title: err.message || 'Could not save default lists', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lists.length) return;
    const next = [...lists];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  if (loading) return <div className="skeleton h-56" />;

  return (
    <section className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/14 text-primary">
            <ListPlus size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Default lists</h3>
            <p className="mt-0.5 text-xs text-muted">
              New boards receive these lists in the order shown when starter lists are enabled.
            </p>
          </div>
        </div>
        {saving && <Spinner size={14} />}
      </div>

      <div className="space-y-1.5">
        {lists.map((list, index) => (
          <div key={index} className="flex items-center gap-2 rounded-md bg-surface2/50 p-1.5">
            <span className="w-7 shrink-0 text-center text-xs font-semibold tabular-nums text-muted">
              {index + 1}
            </span>
            <input
              className="input py-1.5 text-sm"
              value={list.title}
              maxLength={120}
              placeholder="List name"
              onChange={(event) => {
                const next = [...lists];
                next[index] = { title: event.target.value };
                setLists(next);
              }}
              onBlur={() => save(lists)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
            />
            <div className="flex shrink-0 gap-0.5">
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => move(index, -1)}
                disabled={index === 0 || saving}
                aria-label={`Move ${list.title} up`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => move(index, 1)}
                disabled={index === lists.length - 1 || saving}
                aria-label={`Move ${list.title} down`}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="btn btn-ghost btn-icon text-muted hover:text-danger"
                onClick={() => save(lists.filter((_, itemIndex) => itemIndex !== index))}
                disabled={saving}
                aria-label={`Remove ${list.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {lists.length === 0 && (
          <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
            <p className="text-sm font-medium">No default lists</p>
            <p className="mt-1 text-xs text-muted">New boards will start without lists.</p>
          </div>
        )}
      </div>

      <button
        className="btn btn-subtle mt-3 py-1.5 text-xs"
        onClick={() => save([...lists, { title: `New list ${lists.length + 1}` }])}
        disabled={lists.length >= 30 || saving}
      >
        <Plus size={14} /> Add default list
      </button>
    </section>
  );
}
