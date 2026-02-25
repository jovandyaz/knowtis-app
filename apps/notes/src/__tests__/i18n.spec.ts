import i18n from '../lib/i18n';

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
});
