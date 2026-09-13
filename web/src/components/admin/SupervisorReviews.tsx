import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Clock3, CornerDownRight, XCircle } from 'lucide-react';
import { get, post } from '../../lib/api';
import { timeAgo } from '../../lib/utils';
import { useApp } from '../../store/app';
import { Avatar, EmptyState, Spinner } from '../ui';

export function SupervisorReviews() {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await get<{ cards: any[] }>('/api/admin/reviews');
      setCards(res.cards);
    } catch (err: any) {
      toast({ title: err.message || 'Could not load the review queue', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (card: any, decision: 'approve' | 'reject') => {
    setBusy(card.id);
    try {
      await post(
        card.kind === 'board' ? `/api/boards/${card.id}/review` : `/api/cards/${card.id}/review`,
        { decision }
      );
      setCards((current) => current.filter((item) => item.id !== card.id));
      toast({
        title: decision === 'approve' ? 'Work approved' : 'Work returned for changes',
        description: card.title,
        tone: decision === 'approve' ? 'success' : 'info',
      });
    } catch (err: any) {
      toast({ title: err.message || 'Could not save the review', tone: 'error' });
      load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Completion reviews</h2>
          <p className="mt-0.5 text-sm text-muted">
            Approve finished boards, tasks and subtasks before they count as complete.
          </p>
        </div>
        {cards.length > 0 && (
          <span className="chip bg-warning/14 text-warning">
            <Clock3 size={12} /> {cards.length} waiting
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="glass rounded-2xl">
          <EmptyState
            icon={<ClipboardCheck size={27} />}
            title="The review queue is clear"
            description="New completion requests will appear here for a Supervisor to accept or return."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => {
            const isBoard = card.kind === 'board';
            const checklist = (card.checklists ?? []).flatMap((list: any) => list.items);
            const checklistDone = checklist.filter((item: any) => item.isDone).length;
            const subtasksDone = (card.children ?? []).filter((child: any) => child.isComplete).length;
            return (
              <div key={`${card.kind}:${card.id}`} className="glass glass-sheen rounded-xl p-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      navigate(isBoard ? `/b/${card.id}` : `/b/${card.board.id}?card=${card.id}`)
                    }
                  >
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      {!isBoard && card.parentId && <CornerDownRight size={13} className="shrink-0 text-muted" />}
                      <span className="chip bg-warning/12 text-[9px] uppercase text-warning">
                        {isBoard ? 'Board' : card.parentId ? 'Subtask' : 'Task'}
                      </span>
                      {!isBoard && <span className="font-mono text-[11px] text-muted">#{card.number}</span>}
                      <span className="truncate">{card.title}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-muted">
                      <span style={{ color: isBoard ? card.color : card.board.color }}>
                        {(isBoard ? card.icon : card.board.icon) || '📋'}
                      </span>{' '}
                      {isBoard ? `${card._count.cards} tasks · ${card._count.lists} lists` : `${card.board.title} · ${card.list.title}`}
                      {card.submittedBy && ` · by ${card.submittedBy.name}`}
                      {card.submittedForReviewAt && ` · submitted ${timeAgo(card.submittedForReviewAt)}`}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    {checklist.length > 0 && (
                      <span className="chip bg-success/12 text-success">
                        {checklistDone}/{checklist.length} checked
                      </span>
                    )}
                    {(card.children?.length ?? 0) > 0 && (
                      <span className="chip bg-success/12 text-success">
                        {subtasksDone}/{card.children.length} subtasks
                      </span>
                    )}
                    <span className="flex -space-x-1.5">
                      {(card.assignees ?? []).slice(0, 3).map(({ user }: any) => (
                        <Avatar key={user.id} user={user} size={22} ring />
                      ))}
                    </span>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="btn btn-subtle text-xs text-danger"
                      disabled={busy === card.id}
                      onClick={() => decide(card, 'reject')}
                    >
                      {busy === card.id ? <Spinner size={13} /> : <XCircle size={14} />}
                      Return
                    </button>
                    <button
                      className="btn btn-primary text-xs"
                      disabled={busy === card.id}
                      onClick={() => decide(card, 'approve')}
                    >
                      {busy === card.id ? <Spinner size={13} /> : <CheckCircle2 size={14} />}
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
