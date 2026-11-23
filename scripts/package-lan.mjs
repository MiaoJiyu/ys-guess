import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const release = path.join(root, 'release');
const mainStage = path.join(release, 'lan-main');
const shareStage = path.join(release, 'lan-share');
const shareZip = path.join(release, 'teyvat-lan-host-share.zip');
const finalZip = path.join(release, 'teyvat-lan-host.zip');

const baseFiles = ['index.html', 'app.css', 'game.js', 'makers.css', 'makers.js', 'server.js', 'players.json'];
const baseDirs = ['shared', 'assets'];

function copyBase(stage) {
  fs.mkdirSync(stage, { recursive: true });
  for (const file of baseFiles) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(stage, path.basename(file)));
  }
  for (const dir of baseDirs) {
    const source = path.join(root, dir);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(stage, dir), { recursive: true });
  }
  const batch = path.join(root, 'launcher', 'start.bat');
  if (fs.existsSync(batch)) fs.copyFileSync(batch, path.join(stage, '一键启动.bat'));
  const shell = path.join(root, 'launcher', 'start.sh');
  if (fs.existsSync(shell)) fs.copyFileSync(shell, path.join(stage, 'start.sh'));
  const setup = path.join(root, 'launcher', 'setup-node.ps1');
  if (fs.existsSync(setup)) fs.copyFileSync(setup, path.join(stage, 'setup-node.ps1'));
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
    name: 'teyvat-lan-host',
    version: '3.0.0',
    private: true,
    type: 'module',
    scripts: { start: 'node server.js' },
    engines: { node: '>=20' },
  }, null, 2) + '\n', 'utf8');
}

function zipDirectory(stage, zipPath) {
  fs.rmSync(zipPath, { force: true });
  if (process.platform === 'win32') {
    const command = [
      'Add-Type -AssemblyName System.IO.Compression',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$stage = '${stage}'`,
      `$zip = '${zipPath}'`,
      'if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }',
      '$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)',
      'Get-ChildItem -Force -Recurse -LiteralPath $stage | Where-Object { -not $_.PSIsContainer } | ForEach-Object {',
      '  $name = $_.FullName.Substring($stage.Length + 1).Replace([char]92, [char]47)',
      '  $entry = $archive.CreateEntry($name)',
      '  $source = [IO.File]::OpenRead($_.FullName)',
      '  $target = $entry.Open()',
      '  $source.CopyTo($target)',
      '  $target.Dispose()',
      '  $source.Dispose()',
      '}',
      '$archive.Dispose()',
    ].join('\n');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error('局域网启动包压缩失败');
    return;
  }
  const result = spawnSync('zip', ['-r', zipPath, '.'], { cwd: stage, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('局域网启动包压缩失败');
}

fs.rmSync(mainStage, { recursive: true, force: true });
fs.rmSync(shareStage, { recursive: true, force: true });
fs.rmSync(shareZip, { force: true });
fs.mkdirSync(release, { recursive: true });

copyBase(shareStage);
zipDirectory(shareStage, shareZip);

copyBase(mainStage);
fs.mkdirSync(path.join(mainStage, 'download'), { recursive: true });
fs.copyFileSync(shareZip, path.join(mainStage, 'download', 'teyvat-lan-host.zip'));
zipDirectory(mainStage, finalZip);

fs.rmSync(shareStage, { recursive: true, force: true });
fs.rmSync(mainStage, { recursive: true, force: true });
fs.rmSync(shareZip, { force: true });

console.log(`已生成局域网一键启动包：${finalZip}`);
