// ZIP writer tests: node --test app/tests/zip.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipFiles, unzip, crc32 } from '../src/core/zip.js';

const FILES = [
  { name: 'collar.csv', data: 'holeId,east\r\nMU2601,512000\r\n' },
  { name: 'Литологи/тайлбар.md', data: '# Тайлан\nFRHYF → FRHY\n' },
  { name: 'bin.dat', data: new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]) },
  { name: 'empty.txt', data: '' },
];

function has(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('local headers, central directory and end record are consistent', () => {
  const z = zipFiles(FILES, { date: new Date(2026, 8, 28, 12, 30, 10) });
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 flag');
  assert.equal(dv.getUint16(8, true), 0, 'STORE');
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), FILES.length);
  const cdOff = dv.getUint32(eocd + 16, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  assert.equal(cdOff + cdSize, eocd);
  let p = cdOff;
  for (const f of FILES) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const nameLen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nameLen));
    assert.equal(name, f.name);
    const off = dv.getUint32(p + 42, true);
    assert.equal(dv.getUint32(off, true), 0x04034b50);
    assert.equal(dv.getUint32(off + 14, true), dv.getUint32(p + 16, true), 'same CRC in local and central header');
    p += 46 + nameLen;
  }
});

test('round trip through unzip()', async () => {
  const z = zipFiles(FILES);
  const back = await unzip(z);
  assert.deepEqual(back.map((f) => f.name), FILES.map((f) => f.name));
  assert.equal(new TextDecoder().decode(back[1].data), FILES[1].data);
  assert.deepEqual([...back[2].data], [...FILES[2].data]);
});

test('python3 zipfile and unzip accept the archive', { skip: !has('python3') && 'python3 not available' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ordzip-'));
  try {
    const path = join(dir, 'test.zip');
    writeFileSync(path, zipFiles(FILES));
    const list = execFileSync('python3', ['-m', 'zipfile', '-l', path], { encoding: 'utf8' });
    for (const f of FILES) assert.ok(list.includes(f.name), `${f.name} listed`);
    const t = execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); print(z.read("Литологи/тайлбар.md").decode())', path], { encoding: 'utf8' });
    assert.match(t, /^None\n/, 'testzip() finds no bad CRC');
    assert.match(t, /FRHYF → FRHY/);
    let u = null;
    try {
      u = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // unzip not installed: python check above is enough
    }
    if (u !== null) assert.match(u, /4 files/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unzip() inflates DEFLATE entries written by other tools', { skip: !has('python3') && 'python3 not available' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ordzip-'));
  try {
    const path = join(dir, 'deflated.zip');
    execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED); z.writestr("backup.json", "{\\"format\\":\\"ord-project\\"}"*50); z.close()', path]);
    const { readFileSync } = await import('node:fs');
    const back = await unzip(readFileSync(path));
    assert.equal(back[0].name, 'backup.json');
    assert.ok(new TextDecoder().decode(back[0].data).startsWith('{"format":"ord-project"}'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
