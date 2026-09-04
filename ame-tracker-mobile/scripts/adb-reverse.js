/**
 * Ensures USB-connected Android devices can reach the Nest API / Metro via
 * localhost. Safe to run when no device is connected — exits 0 either way.
 */
const { execSync } = require('child_process')

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' })
    return true
  } catch {
    return false
  }
}

function hasAdb() {
  try {
    execSync('adb version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!hasAdb()) {
  console.log('[adb-reverse] adb not found — skip (OK for emulator / Wi-Fi)')
  process.exit(0)
}

let devices = ''
try {
  devices = execSync('adb devices', { encoding: 'utf8' })
} catch {
  console.log('[adb-reverse] could not list devices — skip')
  process.exit(0)
}

const connected = devices
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('*') && line.includes('\tdevice'))

if (!connected.length) {
  console.log('[adb-reverse] no USB device online — skip')
  process.exit(0)
}

const ok3000 = run('adb reverse tcp:3000 tcp:3000')
const ok8081 = run('adb reverse tcp:8081 tcp:8081')

if (ok3000 && ok8081) {
  console.log('[adb-reverse] tcp:3000 and tcp:8081 forwarded for', connected.length, 'device(s)')
} else {
  console.log('[adb-reverse] partial failure — app will try LAN IP fallback')
}

process.exit(0)
