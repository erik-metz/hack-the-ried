import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadRoute(fetch) {
  const source = fs.readFileSync(new URL('../app/api/maengelmelder/[id]/route.ts', import.meta.url), 'utf8');
  const context = { exports: {}, URL, Response, AbortSignal, fetch };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}

test('Mängelmelder detail route validates IDs without fetching', async () => {
  const route = loadRoute(() => { throw new Error('must not fetch'); });
  const response = await route.GET(new Request('https://map.example/api/maengelmelder/nope'), { params: Promise.resolve({ id: '../1' }) });
  assert.equal(response.status, 400);
});

test('Mängelmelder detail route returns public text and safe public images only', async () => {
  let requestUrl;
  const route = loadRoute(async url => {
    requestUrl = url;
    return Response.json({ success: true, data: {
      id: 123, text: 'Öffentliche Beschreibung', created: '2026-10-27T10:00:00Z', state_german: 'Offen',
      message_type: { name: 'Beleuchtung' }, address: 'do not return', responsible_name: 'do not return',
      attachments: [
        { public: true, content_type: 'image/jpeg', url: 'https://td50285-wdw.s3-de.teledata.cloud/full.jpg', thumbnails: { res800: 'https://td50285-wdw.s3-de.teledata.cloud/preview.jpg' } },
        { public: false, content_type: 'image/jpeg', url: 'https://td50285-wdw.s3-de.teledata.cloud/private.jpg' },
        { public: true, content_type: 'image/jpeg', url: 'https://attacker.example/image.jpg' },
        { public: true, content_type: 'application/pdf', url: 'https://td50285-wdw.s3-de.teledata.cloud/file.pdf' },
      ],
    } });
  });
  const response = await route.GET(new Request('https://map.example/api/maengelmelder/123'), { params: Promise.resolve({ id: '123' }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(requestUrl, 'https://www.xn--mngelmelder-l8a.de/api/v1/domain/32/message/123');
  assert.equal(body.description, 'Öffentliche Beschreibung');
  assert.equal(body.category, 'Beleuchtung');
  assert.equal(body.images.length, 1);
  assert.equal(body.images[0].preview, 'https://td50285-wdw.s3-de.teledata.cloud/preview.jpg');
  assert.equal('address' in body, false);
  assert.equal('responsible_name' in body, false);
});

test('Mängelmelder detail route rejects a mismatched upstream ID', async () => {
  const route = loadRoute(async () => Response.json({ success: true, data: { id: 456 } }));
  const response = await route.GET(new Request('https://map.example/api/maengelmelder/123'), { params: Promise.resolve({ id: '123' }) });
  assert.equal(response.status, 404);
});

test('Content Security Policy permits the official Mängelmelder photo host', async () => {
  const source = fs.readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const headers = await context.exports.default.headers();
  assert.match(headers[0].headers[0].value, /img-src[^;]*https:\/\/td50285-wdw\.s3-de\.teledata\.cloud/);
});
