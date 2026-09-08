import { createInstance, type i18n as I18nInstance } from 'i18next';

let i18n: I18nInstance;

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.lang = 'before-initialization';
  vi.doUnmock('i18next');
  vi.resetModules();
  const isolatedI18n = createInstance();
  vi.doMock('i18next', () => ({ default: isolatedI18n }));

  ({ default: i18n } = await import('../lib/i18n'));
  await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
});

afterEach(() => {
  vi.doUnmock('i18next');
  vi.resetModules();
  localStorage.clear();
  document.documentElement.removeAttribute('lang');
});

describe('i18n configuration', () => {
  it('should initialize with supported languages', () => {
    expect(i18n.options.supportedLngs).toContain('en');
    expect(i18n.options.supportedLngs).toContain('es');
  });

  it('should have all namespaces loaded', () => {
    expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'auth')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'notes')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'errors')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'auth')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'notes')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'errors')).toBe(true);
  });

  it('should switch language', async () => {
    await i18n.changeLanguage('es');
    expect(i18n.language).toBe('es');
    expect(i18n.t('buttons.save', { ns: 'common' })).toBe('Guardar');

    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('buttons.save', { ns: 'common' })).toBe('Save');
  });

  it('should fall back to English for missing keys', async () => {
    await i18n.changeLanguage('es');
    const result = i18n.t('nonexistent.key' as never, { ns: 'common' });
    expect(result).toBe('nonexistent.key');
  });

  it('sets the document language after initialization', () => {
    expect(i18n.resolvedLanguage).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('updates the document language when the language changes', async () => {
    await i18n.changeLanguage('es');
    expect(document.documentElement.lang).toBe('es');

    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to English when a language event has no resolved language', () => {
    Object.defineProperty(i18n, 'resolvedLanguage', {
      configurable: true,
      value: undefined,
    });
    document.documentElement.lang = 'before-language-event';

    i18n.emit('languageChanged', '');

    expect(document.documentElement.lang).toBe('en');
  });
});
