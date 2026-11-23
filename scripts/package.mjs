import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const stage = path.join(release, 'upload');
const zipPath = path.join(release, 'teyvat-element-guess-makers.zip');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('未找到 dist/index.html，请先执行 npm run build');
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(dist, stage, { recursive: true });

const npmrc = path.join(root, '.npmrc');
if (fs.existsSync(npmrc)) fs.copyFileSync(npmrc, path.join(stage, '.npmrc'));

const forbidden = ['tencent_api.env', 'server.js', 'server.py', 'players.json', 'data', 'scripts', 'node_modules', 'edgeone.json', '.git'];
for (const name of forbidden) {
  fs.rmSync(path.join(stage, name), { recursive: true, force: true });
}

const required = [
  'index.html', 'app.css', 'game.js', 'makers.css', 'makers.js', 'package.json',
  'cloud-functions/api/[[default]].js', 'shared/api.js', 'shared/store.js',
];
for (const file of required) {
  if (!fs.existsSync(path.join(stage, file))) throw new Error(`上传包缺少 ${file}`);
}

const uploadPackagePath = path.join(stage, 'package.json');
const uploadPackage = JSON.parse(fs.readFileSync(uploadPackagePath, 'utf8'));
uploadPackage.scripts = {
  build: "node -e \"console.log('Makers upload package is prebuilt; skipping build')\"",
};
delete uploadPackage.devDependencies;
fs.writeFileSync(uploadPackagePath, JSON.stringify(uploadPackage, null, 2) + '\n', 'utf8');

const buildCheck = spawnSync('npm run build', {
  cwd: stage,
  stdio: 'inherit',
  shell: true,
});
if (buildCheck.status !== 0) throw new Error('上传包预构建检查失败');

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
  if (result.status !== 0) throw new Error('ZIP 打包失败');
} else {
  const result = spawnSync('zip', ['-r', zipPath, '.'], { cwd: stage, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ZIP 打包失败');
}

fs.rmSync(stage, { recursive: true, force: true });
console.log(`已生成 Makers 直接上传包：${zipPath}`);
