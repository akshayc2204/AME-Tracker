/**
 * Build the Windows installer. Run this on the Windows server (or a Windows
 * build PC) so bcrypt and Prisma match that machine's Node.js.
 *
 *   cd ame-tracker-desktop
 *   npm install
 *   npm run package:win
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.platform !== 'win32') {
  console.error('package:win must be run on Windows so native modules match the client PC.')
  process.exit(1)
}

const desktop = path.resolve(__dirname, '..')
const root = path.resolve(desktop, '..')
const backend = path.join(root, 'ame-tracker-backend')
const portal = path.join(root, 'ame-tracker-web-portal')
const staging = path.join(desktop, 'staging')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(result.status || 1)
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true })
}

run('npm', ['run', 'build'], portal)
run('npm', ['run', 'build'], backend)

fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(path.join(staging, 'backend'), { recursive: true })
fs.mkdirSync(path.join(staging, 'node'), { recursive: true })

copyDir(path.join(backend, 'dist'), path.join(staging, 'backend', 'dist'))
copyDir(path.join(backend, 'prisma'), path.join(staging, 'backend', 'prisma'))
fs.copyFileSync(path.join(backend, 'package.json'), path.join(staging, 'backend', 'package.json'))
fs.copyFileSync(path.join(backend, 'package-lock.json'), path.join(staging, 'backend', 'package-lock.json'))
copyDir(path.join(portal, 'dist'), path.join(staging, 'portal'))
fs.copyFileSync(process.execPath, path.join(staging, 'node', 'node.exe'))

run('npm', ['ci', '--omit=dev'], path.join(staging, 'backend'))
run('npx', ['prisma', 'generate'], path.join(staging, 'backend'))
run('npx', ['electron-builder', '--win', 'nsis'], desktop)

console.log(`Installer written to ${path.join(desktop, 'release')}`)
