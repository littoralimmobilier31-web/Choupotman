'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TaskDrawer } from './task-modals';

/**
 * Opens the task drawer for `?tache=<id>`.
 *
 * Selection lives in the URL so a task is linkable from a list, a board, a
 * notification or the command palette; closing removes just that parameter and
 * keeps every active filter.
 */
export function TaskDrawerHost({
  csrf,
  assignees,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  assignees: { id: number; label: string }[];
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const taskId = Number.parseInt(searchParams.get('tache') ?? '', 10);
  if (!Number.isInteger(taskId) || taskId <= 0) return null;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tache');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <TaskDrawer
      csrf={csrf}
      taskId={taskId}
      assignees={assignees}
      canUpdate={canUpdate}
      canDelete={canDelete}
      onChanged={() => router.refresh()}
      onClose={close}
    />
  );
}
