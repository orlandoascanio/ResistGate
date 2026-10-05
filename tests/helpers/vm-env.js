import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function createDummyElement() {
  return {
    addEventListener: () => {},
    blur: () => {},
    setAttribute: () => {},
    appendChild: () => {},
    remove: () => {},
    focus: () => {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {}
    },
    style: {},
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    parentNode: null,
    type: 'text'
  };
}

export function createBrowserLikeGlobals() {
  return {
    document: {
      addEventListener: () => {},
      getElementById: () => createDummyElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => createDummyElement()
    },
    window: {
      open: () => {}
    },
    alert: () => {},
    confirm: () => true,
    location: {
      reload: () => {}
    }
  };
}

export function createChromeMock() {
  const storageData = {};
  let onMessageHandler = null;
  let onInstalledHandler = null;
  let onStartupHandler = null;
  let onAlarmHandler = null;
  let onStorageChangedHandler = null;
  let onMessageExternalHandler = null;
  const alarms = new Map();
  const createdTabs = [];
  let sessionRules = [];
  let nextRulesUpdateError = null;

  const chrome = {
    runtime: {
      id: 'resistgate-test-extension',
      lastError: null,
      onInstalled: {
        addListener: (handler) => {
          onInstalledHandler = handler;
        }
      },
      onStartup: {
        addListener: (handler) => {
          onStartupHandler = handler;
        }
      },
      onMessage: {
        addListener: (handler) => {
          onMessageHandler = handler;
        }
      },
      onMessageExternal: {
        addListener: (handler) => {
          onMessageExternalHandler = handler;
        }
      },
      getURL: (assetPath) => `chrome-extension://resistgate/${assetPath}`,
      setUninstallURL: () => {}
    },
    tabs: {
      create: async (details) => {
        createdTabs.push(details);
        return details;
      }
    },
    alarms: {
      onAlarm: {
        addListener: (handler) => {
          onAlarmHandler = handler;
        }
      },
      getAll: async () => [...alarms.values()],
      create: async (name, data) => {
        alarms.set(name, { name, ...data });
      },
      clear: async (name) => {
        alarms.delete(name);
      }
    },
    storage: {
      onChanged: {
        addListener: (handler) => {
          onStorageChangedHandler = handler;
        }
      },
      local: {
        get: (keys, callback) => {
          let result = {};

          if (Array.isArray(keys)) {
            for (const key of keys) {
              result[key] = storageData[key];
            }
          } else if (typeof keys === 'string') {
            result[keys] = storageData[keys];
          } else if (keys && typeof keys === 'object') {
            for (const key of Object.keys(keys)) {
              result[key] = storageData[key];
            }
          } else {
            result = { ...storageData };
          }

          callback(result);
        },
        set: (value, callback) => {
          Object.assign(storageData, value || {});
          callback();
        },
        remove: (keys, callback) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storageData[key];
          }
          callback();
        }
      }
    },
    declarativeNetRequest: {
      getSessionRules: async () => [...sessionRules],
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] } = {}) => {
        if (nextRulesUpdateError) {
          const error = nextRulesUpdateError;
          nextRulesUpdateError = null;
          throw error;
        }

        const removeIds = new Set(removeRuleIds);
        sessionRules = sessionRules
          .filter((rule) => !removeIds.has(rule.id))
          .concat(addRules);
      }
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {}
    }
  };

  async function sendMessage(request) {
    if (!onMessageHandler) {
      throw new Error('onMessage handler not registered');
    }

    return new Promise((resolve) => {
      const maybeAsync = onMessageHandler(request, { id: chrome.runtime.id }, (response) => {
        resolve(response);
      });

      if (maybeAsync !== true) {
        resolve(undefined);
      }
    });
  }

  async function sendExternalMessage(request, sender) {
    if (!onMessageExternalHandler) {
      throw new Error('onMessageExternal handler not registered');
    }

    return new Promise((resolve) => {
      const maybeAsync = onMessageExternalHandler(request, sender || {}, (response) => {
        resolve(response);
      });

      if (maybeAsync !== true) {
        resolve(undefined);
      }
    });
  }

  async function triggerInstalled(details) {
    if (onInstalledHandler) {
      onInstalledHandler(details || { reason: 'install' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function triggerStartup() {
    if (onStartupHandler) {
      onStartupHandler();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function triggerAlarm(alarm) {
    if (onAlarmHandler) {
      onAlarmHandler(alarm);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function triggerStorageChanged(changes, namespace) {
    if (onStorageChangedHandler) {
      onStorageChangedHandler(changes || {}, namespace || 'local');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    chrome,
    storageData,
    createdTabs,
    sendMessage,
    sendExternalMessage,
    triggerInstalled,
    triggerStartup,
    triggerAlarm,
    triggerStorageChanged,
    getSessionRules: () => [...sessionRules],
    failNextRulesUpdate(message = 'Rules update failed') {
      nextRulesUpdateError = new Error(message);
    }
  };
}

export async function loadScriptInVm(relativeScriptPath, globals = {}) {
  const scriptPath = path.resolve(REPO_ROOT, relativeScriptPath);
  const code = fs.readFileSync(scriptPath, 'utf8');

  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Promise,
    URL,
    URLSearchParams,
    ArrayBuffer,
    Uint8Array,
    AbortController,
    crypto: globalThis.crypto,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    ...globals,
    globalThis: {}
  };

  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });

  await new Promise((resolve) => setTimeout(resolve, 0));
  return context;
}
