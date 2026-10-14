const { spawn, spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const backend = path.join(root, 'ame-tracker-backend')
const portal = path.join(root, 'ame-tracker-web-portal')
const desktop = path.resolve(__dirname, '..')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

run('npm', ['run', 'build'], portal)
run('npm', ['run', 'build'], backend)

const electron = spawn('npx', ['electron', '.'], {
  cwd: desktop,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

electron.on('exit', (code) => process.exit(code || 0))
