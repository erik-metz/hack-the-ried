import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
test('real receiver handles loss, out-of-order delivery, duplicates, corrupt images and flash failures', () => {
  const dir=mkdtempSync(join(tmpdir(),'fuota-test-'));
  try {
    const binary=join(dir,'transfer');
    execFileSync('c++',['-std=c++17','-Wall','-Wextra','-Werror','-o',binary,fileURLToPath(new URL('transfer.cpp',import.meta.url))]);
    execFileSync(binary);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
