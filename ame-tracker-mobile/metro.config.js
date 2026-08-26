const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Faster dev reloads on Windows — avoid watching huge folders outside the app.
config.watchFolders = [__dirname]
config.resolver.unstable_enableSymlinks = false

module.exports = config
