import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildArchives } from './archive.mjs';
import { buildMonthlyArchive, combineArchives, repackArchive } from './monthly.mjs';

const python = process.env.PYTHON || 'python3';
const hasArrow = (() => { try { execFileSync(python, ['-c','import pyarrow'], { stdio:'ignore' }); return true; } catch { return false; } })();
const month = '2026-10', generated = '2026-11-01T01:00:00Z';
function* rows() {
  for (let i=0; i<120; i++) yield {
    entity:{ id:`station-${i%2}`,name:`Name ${i}`,entity_type:'sensor',metadata:'{"precise":9007199254740993}' },
    definition:{ id:String(9007199254740993n + BigInt(i%2)), entity_id:`station-${i%2}`,metric:'temperature',unit:'C',
      source_id:'test',basis:'observed',dimensions:'{}',semantics:'instantaneous' },
    reading:{ measurement_id:String(9007199254740993n + BigInt(i%2)),observed_at:'2026-10-01T00:00:00.123456Z',
      collected_at:'2026-10-01T00:01:00.654321Z',value:`-${i}.1234567890123456789`,quality:'valid',provenance:'{"counter":9007199254740993}',revision:i },
  };
}

test('complete month has one ZIP and three tables with unique metadata and exact original readings', {skip:!hasArrow}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'whole-month-'));
  try {
    const result=await buildMonthlyArchive(rows(),dir,month,generated,4096);
    assert.equal(result.files.length,1);
    assert.equal(result.reading_count,120);
    const file=result.files[0];
    assert.equal((await stat(file.path)).size,file.size_bytes);
    execFileSync(python,['-c',`
import io,json,zipfile,sys,pyarrow.parquet as pq
with zipfile.ZipFile(sys.argv[1]) as z:
 assert set(z.namelist())=={'entities.parquet','measurement_definitions.parquet','readings.parquet','manifest.json','README.txt'}
 tables={t:pq.read_table(io.BytesIO(z.read(t+'.parquet'))).to_pylist() for t in ('entities','measurement_definitions','readings')}
 assert len(tables['entities'])==2 and len(tables['measurement_definitions'])==2
 assert len({r['id'] for r in tables['entities']})==2
 assert {r['name'] for r in tables['entities']}=={'Name 118','Name 119'}
 for i,row in enumerate(tables['readings']):
  assert row['measurement_id']==str(9007199254740993+i%2)
  assert row['value']==f'-{i}.1234567890123456789'
  assert row['observed_at'].microsecond==123456 and row['collected_at'].microsecond==654321
  assert row['provenance']=='{"counter":9007199254740993}' and row['revision']==i
 manifest=json.loads(z.read('manifest.json'))
 assert manifest['reading_count']==120 and manifest['tables']=={'entities':2,'measurement_definitions':2,'readings':120}
 assert manifest['generated_at']=='2026-11-01T01:00:00Z' and manifest['part']==1
`,file.path]);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('existing snapshots repack from verified downloads without rereading or altering source rows', {skip:!hasArrow}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'repack-month-'));
  try {
    const source=await buildArchives(rows(),dir,month,generated,4096);
    assert.ok(source.files.length>1);
    const contents=new Map();
    const previous={month,reading_count:120,entity_ids:source.entity_ids,files:[]};
    for(const [i,file] of source.files.entries()) {
      const url=`https://test.ufs.sh/f/part-${i}`;
      contents.set(url,await readFile(file.path));
      previous.files.push({...file,url});
    }
    const target=path.join(dir,'repack');
    await import('node:fs/promises').then(fs=>fs.mkdir(target));
    let calls=0;
    const result=await repackArchive(previous,target,async(url,options)=>{
      assert.equal(options.headers['User-Agent'],'HackTheRied-ArchiveDownloader/1.0');
      calls++;
      return new Response(contents.get(url),{status:200});
    });
    assert.equal(result.files.length,1);
    assert.equal(result.reading_count,120);
    assert.deepEqual(result.entity_ids,source.entity_ids);
    assert.equal(calls,source.files.length);
    for(const file of source.files) assert.equal((await stat(file.path)).size,file.size_bytes,'Original files stay available until publication');
    const bad=path.join(dir,'bad');
    await import('node:fs/promises').then(fs=>fs.mkdir(bad));
    await assert.rejects(repackArchive(previous,bad,async()=>new Response('corrupt')),/published snapshot remains unchanged/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('assembly rejects corrupt parts before producing a complete download', {skip:!hasArrow}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'bad-month-'));
  try {
    const source=await buildArchives(rows(),dir,month,generated,4096);
    await writeFile(source.files[0].path,'not the verified source ZIP');
    await assert.rejects(combineArchives(source.files,dir,month),/checksum or size mismatch/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
