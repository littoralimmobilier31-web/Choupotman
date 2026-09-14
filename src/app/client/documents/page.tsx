import Link from 'next/link';
import { Download, FileText, FolderOpen } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { requireClientUser } from '@/lib/auth/guard';
import { portalFiles } from '@/lib/db/portal';
import { formatBytes } from '@/lib/utils';
import { formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

export default async function ClientDocumentsPage() {
  const clientUser = await requireClientUser();
  const files = portalFiles(clientUser.client_id);

  // Grouped by project: that is how a client thinks about their documents.
  const groups: { title: string; projectId: number | null; files: typeof files }[] = [];
  for (const file of files) {
    const title = file.project_title ?? 'Documents généraux';
    const existing = groups.find((group) => group.title === title);
    if (existing) existing.files.push(file);
    else groups.push({ title, projectId: file.project_id, files: [file] });
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg">Documents</h1>
        <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
          Les fichiers partagés avec vous, classés par projet.
        </p>
      </header>

      {files.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <FolderOpen className="mx-auto mb-3 size-6 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun document partagé</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-fg-muted">
              Les livrables et documents partagés avec vous apparaîtront ici au fil du projet.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">
                {group.projectId ? (
                  <Link href={`/client/projets/${group.projectId}`} className="hover:text-accent">
                    {group.title}
                  </Link>
                ) : (
                  group.title
                )}
                <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] tabular-nums text-fg-subtle">
                  {group.files.length}
                </span>
              </h2>

              <ul className="space-y-2">
                {group.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={`/api/client/fichiers/${file.id}`}
                      className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3.5 py-3 transition-colors hover:border-line-strong"
                    >
                      <FileText className="size-4 shrink-0 text-fg-subtle" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-medium text-fg">
                          {file.original_name}
                        </p>
                        <p className="text-[0.625rem] text-fg-subtle">
                          {formatBytes(file.size_bytes)}
                          {file.folder_name && ` · ${file.folder_name}`}
                          {` · ${formatShortDate(file.created_at, 'fr')}`}
                        </p>
                        {file.caption && (
                          <p className="mt-0.5 text-[0.6875rem] text-fg-muted">{file.caption}</p>
                        )}
                      </div>
                      <Download className="size-4 shrink-0 text-fg-subtle" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
