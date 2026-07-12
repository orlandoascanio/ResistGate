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
        }
      }
    },
    declarativeNetRequest: {
      getSessionRules: async () => [],
      updateSessionRules: async () => {}
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
    triggerStorageChanged
  };
}

const BILLING_ENDPOINTS = {
  checkout: 'https://www.orlandoascanio.com/api/checkout/session',
  activate: 'https://www.orlandoascanio.com/api/entitlement/activate-install',
  status: 'https://www.orlandoascanio.com/api/entitlement/install-status'
};

/**
 * Stands in for the orlandoascanio.com billing API. It enforces the same checks the
 * real server must make: an activation token only activates the session it was minted
 * for, and only for the install credential, device, and extension bound to that session.
 */
export function createBillingApiMock() {
  const calls = [];
  const sessions = new Map();
  const tokens = new Map();
  const overrides = new Map();
  let grant = { pro: true, plan: 'yearly', status: 'active' };
  let counter = 0;

  function respond(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    };
  }

  async function fetchMock(url, init = {}) {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });

    const override = overrides.get(url);
    if (override === 'network-error') {
      throw new Error('Network request failed');
    }
    if (override) {
      return respond(override.status, override.body);
    }

    if (url === BILLING_ENDPOINTS.checkout) {
      counter += 1;
      const checkoutId = `chk_${counter}`;
      sessions.set(checkoutId, {
        checkoutId,
        plan: body.plan,
        deviceId: body.deviceId,
        extensionId: body.extensionId,
        installCredential: body.installCredential
      });
      return respond(200, { checkoutId, plan: body.plan, expiresAt: Date.now() + 30 * 60 * 1000 });
    }

    if (url === BILLING_ENDPOINTS.activate) {
      const session = sessions.get(tokens.get(body.activationToken));
      if (!session) {
        return respond(400, { error: 'Invalid or expired activation token' });
      }
      if (
        session.installCredential !== body.installCredential ||
        session.deviceId !== body.deviceId ||
        session.extensionId !== body.extensionId
      ) {
        return respond(403, { error: 'Activation token does not match this installation' });
      }
      return respond(200, { pro: true, plan: session.plan, status: 'active', checkoutId: session.checkoutId });
    }

    if (url === BILLING_ENDPOINTS.status) {
      const known = [...sessions.values()].some((session) => session.installCredential === body.installCredential);
      if (!known) {
        return respond(403, { error: 'Unknown install credential' });
      }
      return respond(200, { ...grant });
    }

    throw new Error(`Unexpected billing request: ${url}`);
  }

  return {
    fetch: fetchMock,
    calls,
    sessions,
    endpoints: BILLING_ENDPOINTS,
    latestCheckoutId: () => [...sessions.keys()].at(-1),
    issueActivationToken(checkoutId, token) {
      counter += 1;
      const activationToken = token || `tok_${counter}`;
      tokens.set(activationToken, checkoutId);
      return activationToken;
    },
    setGrant(next) {
      grant = { ...grant, ...next };
    },
    override(endpoint, response) {
      overrides.set(endpoint, response);
    },
    clearOverrides() {
      overrides.clear();
    }
  };
}

/** Runs the full purchase handshake: plan selection, checkout session, token exchange. */
export async function purchaseProInTest(env, api, plan = 'yearly') {
  const checkout = await env.sendMessage({ action: 'openPricingPage', plan });
  const activationToken = api.issueActivationToken(checkout.checkoutId);
  const activation = await env.sendExternalMessage(
    { action: 'activateProFromWebsite', activationToken },
    { url: 'https://www.orlandoascanio.com/en/pricing' }
  );

  return { checkout, activation, activationToken };
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
