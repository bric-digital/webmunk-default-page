// @ts-nocheck

import rexCorePlugin from '@bric/rex-core/service-worker'
import rexDefaultPagePlugin from '@bric/rex-default-page/service-worker'

console.log(`Imported ${rexCorePlugin} into service worker context...`)
console.log(`Imported ${rexDefaultPagePlugin} into service worker context...`)

self['rexCorePlugin'] = rexCorePlugin
self['rexDefaultPagePlugin'] = rexDefaultPagePlugin

rexCorePlugin.setup()
