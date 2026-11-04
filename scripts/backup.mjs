import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const mode=process.env.MODE ?? 'demo';
if(!['demo','live'].includes(mode))throw new Error('Invalid MODE');
const source=resolve(process.env.DATA_DIR ?? 'data',`${mode}.sqlite`);
if(!existsSync(source))throw new Error('Database does not exist; start the app first');
const dir=resolve(process.env.BACKUP_DIR ?? 'backups');mkdirSync(dir,{recursive:true,mode:0o700});
const target=resolve(dir,`${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(source);db.exec('PRAGMA busy_timeout=10000');
try {db.prepare('VACUUM INTO ?').run(target);}finally{db.close();}
chmodSync(target,0o600);
const check=new DatabaseSync(target,{readOnly:true});
try {if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}finally{check.close();}
console.log(`Verified backup: ${target}`);
