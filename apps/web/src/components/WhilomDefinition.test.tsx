import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhilomDefinition } from './WhilomDefinition';

/**
 * The homepage has to explain its own name. Rendered to static markup rather
 * than through a browser, because the repository has no DOM-testing stack and
 * installing one to assert the presence of some words would be a large tool for
 * a small job.
 */
describe('the Whilom definition', () => {
  const html = renderToStaticMarkup(<WhilomDefinition />);

  it('gives the word, its pronunciation and its senses', () => {
    expect(html).toContain('whilom');
    expect(html).toContain('/ˈwʌɪləm/');
    expect(html).toContain('once · formerly · in times past');
  });

  it('says what Whilom does with the idea', () => {
    expect(html).toContain('An old word for another time.');
    expect(html).toContain('what stood here');
    expect(html).toContain('who lived here');
    expect(html).toContain('from prehistory to the present day');
  });

  it('carries the origin as a supporting line', () => {
    expect(html).toContain('Old English');
    expect(html).toContain('hwīlum');
  });

  it('does not read as a reference article', () => {
    // No citation clutter, no competing senses, no etymological chain.
    expect(html).not.toMatch(/\[\d+(,\s*\d+)*\]/);
    expect(html).not.toMatch(/\bcitation\b/i);
  });

  it('is a labelled landmark rather than a floating block of text', () => {
    expect(html).toContain('aria-labelledby');
  });
});
