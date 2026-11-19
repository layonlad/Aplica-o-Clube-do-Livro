process.argv.splice(2, 0, 'production')
await import('./build-release.mjs')
