import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { BackupManager } from '@/components/admin/backup-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listBackups, restoreInstructions } from '@/lib/backup';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sauvegardes' };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}

export default async function BackupsPage() {
  const user = await requirePermission('backups.view');
  const csrf = (await getCsrfToken()) ?? '';

  const backups = await listBackups();
  const latest = backups[0] ?? null;
  const totalBytes = backups.reduce((total, file) => total + file.sizeBytes, 0);

  return (
    <>
      <PageHeader
        title="Sauvegardes"
        description="Une copie complète de la base de données, prise pendant que l’application tourne. Les quatorze plus récentes sont conservées."
      />

      <SummaryStrip
        items={[
          { label: 'Sauvegardes', value: backups.length },
          { label: 'Espace occupé', value: formatBytes(totalBytes) },
          {
            label: 'Dernière',
            value: latest ? latest.createdAt.slice(0, 10) : 'jamais',
          },
          { label: 'Taille de la dernière', value: latest ? formatBytes(latest.sizeBytes) : '—' },
        ]}
      />

      <div className="mt-5">
        <BackupManager
          csrf={csrf}
          canCreate={can(user, 'backups.create')}
          canDelete={can(user, 'backups.delete')}
          canExport={can(user, 'backups.export')}
          uploadDir={config.storage.uploadDir}
          restore={restoreInstructions(latest?.name ?? 'choupotman-AAAAMMJJ-HHMMSS.db')}
          backups={backups.map((file) => ({
            name: file.name,
            sizeBytes: file.sizeBytes,
            sizeLabel: formatBytes(file.sizeBytes),
            createdAt: file.createdAt,
          }))}
        />
      </div>
    </>
  );
}
