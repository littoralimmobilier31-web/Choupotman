'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Kanban, QuickAddTask, type KanbanColumnData } from './kanban';
import { NewTaskModal } from './task-modals';
import { TaskDrawerHost } from './task-drawer-host';
import type { TaskStatus } from '@/lib/db/types';

/**
 * Global board.
 *
 * The project hub has its own workspace (stages, AI analysis); this is the
 * cross-project view: the same board, plus the shared drawer, which works for a
 * task in any project.
 */
export function TaskBoard({
  csrf,
  columns,
  projects,
  assignees,
  canUpdate,
  canCreate,
  canDelete,
}: {
  csrf: string;
  columns: KanbanColumnData[];
  projects: { id: number; label: string }[];
  assignees: { id: number; label: string }[];
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [addingIn, setAddingIn] = React.useState<TaskStatus | null>(null);

  return (
    <div className="space-y-4">
      {canCreate && <QuickAddTask csrf={csrf} onCreated={() => router.refresh()} />}

      <Kanban
        columns={columns}
        csrf={csrf}
        canUpdate={canUpdate}
        canCreate={canCreate}
        onAddTask={(status) => setAddingIn(status)}
        showProject
        basePath="/espace-admin/taches"
      />

      <TaskDrawerHost csrf={csrf} assignees={assignees} canUpdate={canUpdate} canDelete={canDelete} />

      {addingIn !== null && (
        <NewTaskModal
          csrf={csrf}
          projectId={null}
          projects={projects}
          assignees={assignees}
          defaultStatus={addingIn}
          onCreated={() => router.refresh()}
          onClose={() => setAddingIn(null)}
        />
      )}
    </div>
  );
}
