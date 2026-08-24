export const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarColor: true,
  avatarUrl: true,
  title: true,
  isActive: true,
} as const;

/** Enough of a card to render it as a subtask row or a parent breadcrumb. */
export const cardSummary = {
  id: true,
  title: true,
  number: true,
  isComplete: true,
  priority: true,
  dueDate: true,
  listId: true,
  boardId: true,
  parentId: true,
  assignees: { select: { user: { select: publicUser } } },
  labels: { select: { label: true } },
} as const;

/** Attachments shown on the card itself — the ones posted inside comments live there. */
export const cardInclude = {
  createdBy: { select: publicUser },
  assignees: { include: { user: { select: publicUser } } },
  labels: { include: { label: true } },
  parent: { select: cardSummary },
  children: {
    where: { isArchived: false },
    select: cardSummary,
    orderBy: { position: 'asc' as const },
  },
  checklists: {
    include: { items: { orderBy: { position: 'asc' as const } } },
    orderBy: { position: 'asc' as const },
  },
  attachments: {
    where: { commentId: null },
    include: { uploader: { select: publicUser } },
    orderBy: { createdAt: 'desc' as const },
  },
  _count: { select: { comments: true, attachments: true, children: true } },
} as const;

export const commentInclude = {
  author: { select: publicUser },
  attachments: {
    include: { uploader: { select: publicUser } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;
