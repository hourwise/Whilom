import { describe, expect, it } from 'vitest';
import {
  MEDIA_DECISIONS,
  MediaRightsState,
  RIGHTS_EXPLANATION,
  canCorrectSubject,
  canPublishMedia,
  isMediaDecision,
  mediaAttributionOrNull,
} from './media';

/**
 * The workbench may explain rights state. It may never override it.
 */

describe('publish gating', () => {
  it('offers publish only for media that is actually ready', () => {
    expect(canPublishMedia(MediaRightsState.Ready)).toBe(true);
    for (const state of [
      MediaRightsState.RightsIncomplete,
      MediaRightsState.CreatorUnknown,
      MediaRightsState.LicenceUnsupported,
      MediaRightsState.AssociationReview,
      MediaRightsState.Invalid,
    ]) {
      expect(canPublishMedia(state), state).toBe(false);
    }
  });

  it('has no bypass state', () => {
    // There is deliberately no "publish anyway": rights completeness is an
    // invariant, not a warning a reviewer can dismiss.
    expect(canPublishMedia('publish_anyway')).toBe(false);
    expect(canPublishMedia('')).toBe(false);
  });

  it('lets a reviewer fix only what is theirs to fix', () => {
    // Confirming what an image shows is a judgement a reviewer can make.
    expect(canCorrectSubject(MediaRightsState.AssociationReview)).toBe(true);
    // Who made it and under what terms is not — those are facts about the file.
    expect(canCorrectSubject(MediaRightsState.CreatorUnknown)).toBe(false);
    expect(canCorrectSubject(MediaRightsState.LicenceUnsupported)).toBe(false);
    expect(canCorrectSubject(MediaRightsState.RightsIncomplete)).toBe(false);
  });

  it('explains every state it can be shown', () => {
    for (const state of Object.values(MediaRightsState)) {
      expect(RIGHTS_EXPLANATION[state]?.label, state).toBeTruthy();
      expect(RIGHTS_EXPLANATION[state]?.detail, state).toBeTruthy();
    }
  });
});

describe('display contract', () => {
  it('gives nothing to render when attribution is absent', () => {
    // A caller cannot show the image and quietly omit the credit, because there
    // is no attribution object to destructure.
    expect(mediaAttributionOrNull(null)).toBeNull();
    expect(mediaAttributionOrNull({ text: null })).toBeNull();
    expect(mediaAttributionOrNull({ text: '   ' })).toBeNull();
  });

  it('carries the stored credit rather than rebuilding one', () => {
    const attribution = mediaAttributionOrNull({
      text: '"Abbey.jpg", by Jane Smith, CC BY 4.0, via Wikimedia Commons',
      licenceName: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Abbey.jpg',
    });
    expect(attribution?.text).toContain('Jane Smith');
    expect(attribution?.licenceUrl).toContain('creativecommons.org');
    expect(attribution?.sourceUrl).toContain('commons.wikimedia.org');
  });
});

describe('media decisions', () => {
  it('offers only decisions the review RPC implements', () => {
    expect(MEDIA_DECISIONS.map((d) => d.value).sort()).toEqual(
      ['approved', 'needs_review', 'rejected'].sort(),
    );
    expect(isMediaDecision('approved')).toBe(true);
    expect(isMediaDecision('published')).toBe(false);
    expect(isMediaDecision('force')).toBe(false);
  });
});
