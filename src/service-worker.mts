import { REXConfiguration } from '@bric/rex-core/common'
import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'

export interface REXDefaultPageConfiguration {
  enabled:boolean,
  initial_page?:string,
  default_page?:string,
}

const EMPTY_TAB_URLS = [
  'chrome://newtab/',
  'chrome://newtab',
  'about:blank',
  'chrome://new-tab-page/',
  'edge://newtab/',
  'edge://newtab'
]

// New-tab-page URLs only — deliberately excludes about:blank. A tab navigating
// to a real destination first emits a transient loading event with
// changeInfo.url === 'about:blank' before the real URL commits, while a genuine
// empty new tab reports chrome://newtab/ (never about:blank). Matching
// about:blank at loading time therefore hijacks real navigations.
const NEW_TAB_PAGE_URLS = EMPTY_TAB_URLS.filter((url) => url !== 'about:blank')

class REXDefaultPageModule extends REXServiceWorkerModule {
  initialPage?:string
  defaultPage?:string
  listenersAdded:boolean = false
  tabCreatedListener: Parameters<typeof chrome.tabs.onCreated.addListener>[0] | null = null
  tabUpdatedListener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] | null = null

  moduleName() {
    return 'DefaultPageModule'
  }

  setup() {
    this.refreshConfiguration()
  }

  refreshConfiguration() {
    rexCorePlugin.fetchConfiguration()
      .then((configuration:REXConfiguration) => {
        if (configuration !== undefined) {
          const defaultPageConfig = ((configuration as any)['default_page'] as REXDefaultPageConfiguration) // eslint-disable-line @typescript-eslint/no-explicit-any

          if (defaultPageConfig !== undefined) {
            this.updateConfiguration(defaultPageConfig)

            return
          }
        }

        setTimeout(() => {
          this.refreshConfiguration()
        }, 1000)
      })
  }

  updateConfiguration(config:REXDefaultPageConfiguration) {
    if (config.enabled === false) {
      if (this.listenersAdded) {
        if (this.tabCreatedListener !== null) {
          chrome.tabs.onCreated.removeListener(this.tabCreatedListener)
          this.tabCreatedListener = null
        }
        if (this.tabUpdatedListener !== null) {
          chrome.tabs.onUpdated.removeListener(this.tabUpdatedListener)
          this.tabUpdatedListener = null
        }
        this.listenersAdded = false
      }

      return
    }

    this.initialPage = config.initial_page
    this.defaultPage = config.default_page

    chrome.storage.local.get('rexDefaultPageOpenedInitial')
      .then((response) => {
        if (response.rexDefaultPageOpenedInitial === undefined) {
          chrome.storage.local.set({rexDefaultPageOpenedInitial: true})
          .then(() => {
            if (this.initialPage) {
              chrome.tabs.create({ url: this.initialPage });
            }
          })
        }
      })

    if (this.listenersAdded === false) {
      // onCreated fires at tab birth — catches Edge new tabs before onUpdated.
      // Only redirect when the URL is an explicit new-tab URL; skip empty string
      // here because tabs created with a URL briefly show empty before it resolves.
      this.tabCreatedListener = (tab) => {
        if (EMPTY_TAB_URLS.includes(tab.url ?? '') && this.defaultPage !== undefined) {
          chrome.tabs.update(tab.id!, { url: this.defaultPage })
        }
      }

      // onUpdated catches cases where the tab URL resolves after creation.
      // Decide on where the tab is going (its destination), never on tab.url, which
      // is the page being left. Using tab.url would hijack a click that navigates
      // away from the new tab page. An unknown destination is left untouched.
      this.tabUpdatedListener = (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading') {
          const destination = changeInfo.url ?? tab.pendingUrl
          if (destination !== undefined && NEW_TAB_PAGE_URLS.includes(destination) && this.defaultPage !== undefined) {
            chrome.tabs.update(tabId, { url: this.defaultPage })
          }
        }
      }

      chrome.tabs.onCreated.addListener(this.tabCreatedListener)
      chrome.tabs.onUpdated.addListener(this.tabUpdatedListener)

      this.listenersAdded = true
    }
  }
}

const plugin = new REXDefaultPageModule()

registerREXModule(plugin)

export default plugin
