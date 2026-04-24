// @ts-nocheck

import { test, expect } from './fixtures.js';

const TEST_CONFIG = {
  configuration_url: 'config.json',
  identifier: 'rex-default-page-test',
  default_page: {
    enabled: true,
    initial_page: 'https://example.org/initial',
    default_page: 'https://example.org/default'
  },
  ui: [{
    title: 'Test',
    identifier: 'main',
    default: true
  }]
}

async function loadConfig(serviceWorker, config) {
  return serviceWorker.evaluate(async (configArg) => {
    return new Promise<any>((resolve) => {
      self.rexCorePlugin.handleMessage({
        messageType: 'loadInitialConfiguration',
        configuration: configArg
      }, this, (response:any) => resolve(response))
    })
  }, config)
}

async function waitForDefaultPageModuleReady(serviceWorker) {
  await serviceWorker.evaluate(async () => {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (self.rexDefaultPagePlugin && self.rexDefaultPagePlugin.defaultPage) {
          resolve()
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })
  })
}

test.describe('REX Default Page', () => {
  test('Service worker loads and identifier is set', async ({ serviceWorker }) => {
    await loadConfig(serviceWorker, TEST_CONFIG)

    const identifier = await serviceWorker.evaluate(async () => {
      return new Promise<string>((resolve) => {
        self.rexCorePlugin.handleMessage({
          messageType: 'setIdentifier',
          identifier: 'i-am-rex'
        }, this, () => {
          chrome.storage.local.get('rexIdentifier').then((r) => resolve(r.rexIdentifier))
        })
      })
    })

    expect(identifier).toEqual('i-am-rex')
  })

  test('initial_page opens exactly once', async ({ serviceWorker }) => {
    await loadConfig(serviceWorker, TEST_CONFIG)
    await waitForDefaultPageModuleReady(serviceWorker)

    const result = await serviceWorker.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 500))
      const tabsAfterFirst = await chrome.tabs.query({ url: 'https://example.org/initial*' })
      const flagAfterFirst = (await chrome.storage.local.get('rexDefaultPageOpenedInitial')).rexDefaultPageOpenedInitial

      self.rexDefaultPagePlugin.refreshConfiguration()
      await new Promise((r) => setTimeout(r, 500))
      const tabsAfterSecond = await chrome.tabs.query({ url: 'https://example.org/initial*' })

      return {
        firstRunCount: tabsAfterFirst.length,
        secondRunCount: tabsAfterSecond.length,
        flag: flagAfterFirst
      }
    })

    expect(result.flag).toBe(true)
    expect(result.firstRunCount).toBeGreaterThanOrEqual(1)
    expect(result.secondRunCount).toEqual(result.firstRunCount)
  })

  test('empty new tab is redirected to default_page', async ({ serviceWorker }) => {
    await loadConfig(serviceWorker, TEST_CONFIG)
    await waitForDefaultPageModuleReady(serviceWorker)

    const tabId = await serviceWorker.evaluate(async () => {
      const tab = await chrome.tabs.create({})
      return tab.id
    })

    await expect.poll(async () => {
      return serviceWorker.evaluate(async (id) => {
        const t = await chrome.tabs.get(id)
        return t.url || t.pendingUrl || ''
      }, tabId)
    }, { timeout: 5000 }).toContain('example.org/default')
  })

  test('enabled: false from the start disables redirect', async ({ serviceWorker }) => {
    const disabledConfig = {
      ...TEST_CONFIG,
      default_page: { ...TEST_CONFIG.default_page, enabled: false }
    }

    await loadConfig(serviceWorker, disabledConfig)
    await new Promise((r) => setTimeout(r, 500))

    const finalUrl = await serviceWorker.evaluate(async () => {
      const tab = await chrome.tabs.create({})

      await new Promise((r) => setTimeout(r, 1500))
      const t = await chrome.tabs.get(tab.id)
      return t.url || t.pendingUrl || ''
    })

    expect(finalUrl).not.toContain('example.org/default')
    expect(finalUrl).toMatch(/chrome:\/\/(newtab|new-tab-page)\/?/)
  })

  test('toggling enabled true -> false removes the listener', async ({ serviceWorker }) => {
    await loadConfig(serviceWorker, TEST_CONFIG)
    await waitForDefaultPageModuleReady(serviceWorker)

    const listenerWasAdded = await serviceWorker.evaluate(async () => {
      return self.rexDefaultPagePlugin.listenerAdded === true
    })
    expect(listenerWasAdded).toBe(true)

    await serviceWorker.evaluate(async () => {
      self.rexDefaultPagePlugin.updateConfiguration({
        enabled: false,
        initial_page: 'https://example.org/initial',
        default_page: 'https://example.org/default'
      })
    })

    const listenerStateAfterDisable = await serviceWorker.evaluate(async () => {
      return {
        listenerAdded: self.rexDefaultPagePlugin.listenerAdded,
        tabListener: self.rexDefaultPagePlugin.tabListener
      }
    })
    expect(listenerStateAfterDisable.listenerAdded).toBe(false)
    expect(listenerStateAfterDisable.tabListener).toBeNull()

    const finalUrl = await serviceWorker.evaluate(async () => {
      const tab = await chrome.tabs.create({})
      await new Promise((r) => setTimeout(r, 1500))
      const t = await chrome.tabs.get(tab.id)
      return t.url || t.pendingUrl || ''
    })

    expect(finalUrl).not.toContain('example.org/default')
    expect(finalUrl).toMatch(/chrome:\/\/(newtab|new-tab-page)\/?/)
  })
})
