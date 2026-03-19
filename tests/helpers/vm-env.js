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
  const alarms = new Map();

  const chrome = {
    runtime: {
      id: 'resistgate-test-extension',
      lastError: null,
      onInstalled: {
        addListener: () => {}
      },
      onStartup: {
        addListener: () => {}
      },
      onMessage: {
        addListener: (handler) => {
          onMessageHandler = handler;
        }
      },
      getURL: (assetPath) => `chrome-extension://resistgate/${assetPath}`
    },
    alarms: {
      onAlarm: {
        addListener: () => {}
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
        addListener: () => {}
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
        }
      }
    },
    declarativeNetRequest: {
      getSessionRules: async () => [],
      updateSessionRules: async () => {}
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

  return { chrome, storageData, sendMessage };
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
    ...globals,
    globalThis: {}
  };

  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });

  await new Promise((resolve) => setTimeout(resolve, 0));
  return context;
}
