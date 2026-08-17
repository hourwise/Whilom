import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WikimediaCommonsAdapter } from '../sources/commons/commons-adapter';
import {
  MediaAssociation,
  MediaLicence,
  MediaRightsState,
  assessAssociation,
  assessMediaRights,
  buildAttribution,
  normaliseCommonsRecord,
  normaliseLicence,
  stripHtml,
} from '../transforms/normalise-commons';
import type { NormalisedMedia } from '../transforms/normalise-commons';

/**
 * The rule these tests exist to hold: Whilom does not display an imported image
 * unless it can generate valid attribution for that exact file from stored
 * data. "From Wikimedia Commons" is not a licence.
 */

const LIVE = fileURLToPath(new URL('../sources/commons/fixtures/yorkshire-commons.json', import.meta.url));
const CASES = fileURLToPath(new URL('../sources/commons/fixtures/rights-cases.json', import.meta.url));

async function normaliseAll(path: string): Promise<NormalisedMedia[]> {
  const adapter = new WikimediaCommonsAdapter({ kind: 'file', path });
  const out: NormalisedMedia[] = [];
  for await (const record of adapter.fetch()) out.push(normaliseCommonsRecord(record));
  return out;
}

function byId(media: NormalisedMedia[], id: string): NormalisedMedia {
  const found = media.find((m) => m.sourceFileId === id);
  if (!found) throw new Error(`fixture missing ${id}`);
  return found;
}

describe('licence normalisation', () => {
  it('reads a licence per file, never from the source', () => {
    expect(normaliseLicence('CC BY 4.0')).toBe(MediaLicence.CcBy40);
    expect(normaliseLicence('CC BY-SA 3.0')).toBe(MediaLicence.CcBySa30);
    expect(normaliseLicence('CC0')).toBe(MediaLicence.CC0);
    expect(normaliseLicence('Public domain')).toBe(MediaLicence.PublicDomain);
  });

  it('does not let a share-alike licence match a plain attribution rule', () => {
    // Ordering matters: "CC BY-SA 4.0" must not be read as "CC BY".
    expect(normaliseLicence('CC BY-SA 4.0')).toBe(MediaLicence.CcBySa40);
    expect(normaliseLicence('CC BY-SA 2.0')).toBe(MediaLicence.CcBySa20);
  });

  it('distinguishes a licence we decline from an absence of evidence', () => {
    expect(normaliseLicence('CC BY-NC-ND 4.0')).toBe(MediaLicence.Unsupported);
    expect(normaliseLicence('Fair use')).toBe(MediaLicence.Unsupported);
    expect(normaliseLicence(null, undefined, '')).toBe(MediaLicence.Unknown);
    expect(normaliseLicence('see talk page')).toBe(MediaLicence.Unknown);
  });
});

describe('creator extraction', () => {
  it('strips the HTML Commons publishes in Artist', () => {
    expect(stripHtml('<a href="/wiki/User:X" title="t">Jane Smith</a>')).toBe('Jane Smith');
    expect(stripHtml('Jane &amp; John')).toBe('Jane & John');
    expect(stripHtml('   ')).toBeNull();
    expect(stripHtml(null)).toBeNull();
  });
});

describe('rights gate — deterministic cases', () => {
  it('passes a CC BY file with a creator', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-cc-by.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.Ready);
    expect(result.attribution).toContain('Jane Smith');
    expect(result.attribution).toContain('CC BY 4.0');
  });

  it('passes a CC BY-SA file with a creator', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-cc-by-sa.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.Ready);
    expect(result.attribution).toContain('CC BY-SA 3.0');
  });

  it('passes public domain without a creator, because none is required', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-public-domain.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.Ready);
    expect(result.attribution).toContain('Public domain');
  });

  it('refuses a CC BY-SA file with no creator', async () => {
    // The licence obliges us to name someone and we cannot, so there is no
    // attribution to generate and therefore nothing to display.
    const media = byId(await normaliseAll(CASES), 'File:Case-creator-missing.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.CreatorUnknown);
    expect(result.missing).toContain('creator');
    expect(result.attribution).toBeNull();
  });

  it('refuses a file with no licence at all', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-licence-missing.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.RightsIncomplete);
    expect(result.missing).toContain('licence');
  });

  it('refuses a file whose licence text cannot be read', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-licence-malformed.jpg');
    expect(media.licence).toBe(MediaLicence.Unknown);
    expect(assessMediaRights(media, { associationConfident: true }).state).toBe(
      MediaRightsState.RightsIncomplete,
    );
    // The unreadable original is still stored as evidence for the decision.
    expect(media.licenceRaw).toBe('see talk page');
  });

  it('refuses a non-reusable licence even though it is complete', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-unsupported-licence.jpg');
    expect(media.licence).toBe(MediaLicence.Unsupported);
    expect(assessMediaRights(media, { associationConfident: true }).state).toBe(
      MediaRightsState.LicenceUnsupported,
    );
  });

  it('refuses a file with no source page to attribute to', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-missing-source-url.jpg');
    const result = assessMediaRights(media, { associationConfident: true });
    expect(result.state).toBe(MediaRightsState.Invalid);
    expect(result.missing).toContain('source_page_url');
  });

  it('passes CC0 without a creator', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-cc0.jpg');
    expect(assessMediaRights(media, { associationConfident: true }).state).toBe(MediaRightsState.Ready);
  });
});

describe('entity association', () => {
  it('never treats a category alone as proof of subject', async () => {
    // A category for an abbey complex holds the abbey, the river, the visitor
    // centre, a memorial and an engraving. Only some of those are the abbey.
    const media = byId(await normaliseAll(CASES), 'File:Case-ambiguous-association.jpg');
    const association = assessAssociation(media);
    expect(association.outcome).toBe(MediaAssociation.Review);
    expect(association.reason).toContain('does not assert');
  });

  it('is confident only when structured data says the file depicts the entity', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-strong-association.jpg');
    const association = assessAssociation(media, { depictsQids: ['Q540237'] });
    expect(association.outcome).toBe(MediaAssociation.Confident);
    expect(association.confidence).toBeGreaterThan(0.9);
  });

  it('holds a rights-perfect file back when the subject is uncertain', async () => {
    // Rights and subject are separate questions: a correctly licensed photo of
    // the wrong place is still the wrong place.
    const media = byId(await normaliseAll(CASES), 'File:Case-ambiguous-association.jpg');
    const result = assessMediaRights(media, { associationConfident: false });
    expect(result.state).toBe(MediaRightsState.AssociationReview);
    expect(result.attribution).not.toBeNull();
  });

  it('keeps every named subject when several are asserted', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-multiple-subjects.jpg');
    const both = assessAssociation(media, { depictsQids: ['Q540237', 'Q17534765'] });
    expect(both.outcome).toBe(MediaAssociation.Confident);
  });
});

describe('attribution generation', () => {
  it('composes from stored data rather than one fixed sentence', async () => {
    const cases = await normaliseAll(CASES);
    const ccby = buildAttribution(byId(cases, 'File:Case-cc-by.jpg'), 'Wikimedia Commons');
    const pd = buildAttribution(byId(cases, 'File:Case-public-domain.jpg'), 'Wikimedia Commons');

    expect(ccby).toBe('"Case cc by.jpg", by Jane Smith, CC BY 4.0, via Wikimedia Commons');
    // Public domain needs no "by", so the component is simply absent.
    expect(pd).toBe('"Case public domain.jpg", Public domain, via Wikimedia Commons');
  });

  it('returns null rather than an incomplete credit', async () => {
    const media = byId(await normaliseAll(CASES), 'File:Case-creator-missing.jpg');
    expect(buildAttribution(media, 'Wikimedia Commons')).toBeNull();
  });
});

describe('the live bounded sample', () => {
  it('is bounded and real', async () => {
    const media = await normaliseAll(LIVE);
    expect(media.length).toBeGreaterThanOrEqual(20);
    expect(media.length).toBeLessThanOrEqual(50);
    for (const item of media) {
      expect(item.sourceFileId).toMatch(/^File:/);
      expect(item.sourcePageUrl).toContain('commons.wikimedia.org');
    }
  });

  it('finds more than one licence, because Commons is not one licence', async () => {
    const media = await normaliseAll(LIVE);
    const licences = new Set(media.map((m) => m.licence));
    expect(licences.size).toBeGreaterThan(1);
    expect(licences.has(MediaLicence.Unknown)).toBe(false);
  });

  it('reports how many real files cannot be published as they stand', async () => {
    const media = await normaliseAll(LIVE);
    const states = media.map((m) => assessMediaRights(m, { associationConfident: true }).state);
    const summary = states.reduce<Record<string, number>>((acc, s) => {
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    console.log('\nlive Commons rights states:', summary);
    console.log(
      'licences:',
      media.reduce<Record<string, number>>((acc, m) => {
        acc[m.licence] = (acc[m.licence] ?? 0) + 1;
        return acc;
      }, {}),
    );
    // Real data contains files with no stated creator; that is the point.
    expect(Object.keys(summary).length).toBeGreaterThan(0);
  });

  it('keeps the raw rights evidence alongside the normalised value', async () => {
    for (const item of await normaliseAll(LIVE)) {
      expect(item.raw).toBeDefined();
      if (item.creator) expect(item.creatorRaw).not.toBeNull();
    }
  });
});
