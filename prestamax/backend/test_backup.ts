import { createBackup, listBackups, BACKUP_CONFIG } from './src/services/backupService';

(async () => {
  console.log('Config:', BACKUP_CONFIG);
  console.log('Backups existentes:', listBackups().length);
  const info = await createBackup();
  console.log('Creado:', info);
  const all = listBackups();
  console.log('Total backups ahora:', all.length);
  console.log('Mas reciente:', all[0]);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
