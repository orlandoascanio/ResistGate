import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createBrowserLikeGlobals, createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('UI copy and state logic', () => {
  it('keeps key product copy aligned with discipline positioning', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const popupHtml = fs.readFileSync(path.resolve(repoRoot, 'popup/popup.html'), 'utf8');
    const frictionHtml = fs.readFileSync(path.resolve(repoRoot, 'friction-page/index.html'), 'utf8');

    expect(popupHtml).toContain('Block distractions. Unlock intentionally.');
    expect(popupHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Weekly Discipline Report');
    expect(optionsHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Deeper focus tools and weekly accountability reports.');
    expect(frictionHtml).toContain('You blocked this for a reason.');
  });

  it('maps analytics insights to the expected user-facing guidance', async () => {
    const env = createChromeMock();
    const globals = createBrowserLikeGlobals();
    const context = await loadScriptInVm('options/options.js', {
      chrome: env.chrome,
      ...globals
    });

    const hooks = context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(hooks.getBlockedAttemptsInsight(30)).toBe('High distraction pressure — your blocker is working hard.');
    expect(hooks.getBlockedAttemptsInsight(0)).toBe('No interruptions. Your focus game is strong.');
    expect(hooks.getOverridesInsight(8)).toBe('More overrides than ideal. What patterns do you notice?');
    expect(hooks.getStrictSessionInsight(180)).toBe('Strong commitment. 3+ hours of deep work.');
    expect(hooks.sanitizePreset('strict')).toBe('strict');
    expect(hooks.sanitizePreset('unknown')).toBe('balanced');
    expect(hooks.isProGatedTab('analytics')).toBe(true);
    expect(hooks.isProGatedTab('report')).toBe(true);
    expect(hooks.isProGatedTab('pro')).toBe(true);
    expect(hooks.isProGatedTab('general')).toBe(false);
  });

  it('formats popup blocked-count text cleanly', async () => {
    const env = createChromeMock();
    const globals = createBrowserLikeGlobals();
    const context = await loadScriptInVm('popup/popup.js', {
      chrome: env.chrome,
      ...globals
    });

    const hooks = context.__RESISTGATE_POPUP_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(hooks.getBlockedCountMeta(0)).toBe('No sites blocked');
    expect(hooks.getBlockedCountMeta(1)).toBe('1 blocked');
    expect(hooks.getBlockedCountMeta(8)).toBe('8 blocked');
    expect(hooks.normalizeDomainInput('HTTPS://WWW.YOUTUBE.COM/')).toBe('www.youtube.com');
  });
});
