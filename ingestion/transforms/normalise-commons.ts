import type { CommonsFile, RawMediaRecord } from '../sources/commons/commons-adapter';

/**
 * NORMALISE for Wikimedia Commons media.
 *
 * Licence is decided **per file**, from that file's own rights metadata. It is
 * never inferred from the category, the filename, the entity or the fact that
 * the file is on Commons at all — Commons hosts everything from CC0 to
 * non-reusable fair-use, and treating "Commons" as a licence would be the
 * single most dangerous shortcut available here.
 *
 * The raw values are always retained alongside the normalised ones. The
 * normalised licence is what logic acts on; the raw string is the evidence for
 * that decision, and a reviewer must be able to see both.
 */

/** Mirrors the `public.media_licence` enum. */
export const MediaLicence = {
  CC0: 'CC0-1.0',
  PublicDomain: 'PUBLIC-DOMAIN',
  CcBy20: 'CC-BY-2.0',
  CcBy25: 'CC-BY-2.5',
  CcBy30: 'CC-BY-3.0',
  CcBy40: 'CC-BY-4.0',
  CcBySa20: 'CC-BY-SA-2.0',
  CcBySa25: 'CC-BY-SA-2.5',
  CcBySa30: 'CC-BY-SA-3.0',
  CcBySa40: 'CC-BY-SA-4.0',
  OtherReusable: 'OTHER-REUSABLE',
  Unsupported: 'UNSUPPORTED',
  Unknown: 'UNKNOWN',
} as const;
export type MediaLicence = (typeof MediaLicence)[keyof typeof MediaLicence];

/** Licences that oblige us to name the creator. Mirrors `media_licence_terms`. */
const REQUIRES_ATTRIBUTION = new Set<MediaLicence>([
  MediaLicence.CcBy20, MediaLicence.CcBy25, MediaLicence.CcBy30, MediaLicence.CcBy40,
  MediaLicence.CcBySa20, MediaLicence.CcBySa25, MediaLicence.CcBySa30, MediaLicence.CcBySa40,
  MediaLicence.OtherReusable,
]);

const REUSABLE = new Set<MediaLicence>([
  MediaLicence.CC0, MediaLicence.PublicDomain,
  MediaLicence.CcBy20, MediaLicence.CcBy25, MediaLicence.CcBy30, MediaLicence.CcBy40,
  MediaLicence.CcBySa20, MediaLicence.CcBySa25, MediaLicence.CcBySa30, MediaLicence.CcBySa40,
  MediaLicence.OtherReusable,
]);

/**
 * Licence strings Commons actually publishes, mapped to the controlled
 * vocabulary. Ordered: the more specific pattern must win, or "CC BY-SA 4.0"
 * would match a bare "CC BY" rule.
 */
const LICENCE_PATTERNS: readonly [RegExp, MediaLicence][] = [
  [/^cc0\b|creative\s*commons\s*zero|public\s*domain\s*dedication/i, MediaLicence.CC0],
  [/^cc[\s-]*by[\s-]*sa[\s-]*4\.0/i, MediaLicence.CcBySa40],
  [/^cc[\s-]*by[\s-]*sa[\s-]*3\.0/i, MediaLicence.CcBySa30],
  [/^cc[\s-]*by[\s-]*sa[\s-]*2\.5/i, MediaLicence.CcBySa25],
  [/^cc[\s-]*by[\s-]*sa[\s-]*2\.0/i, MediaLicence.CcBySa20],
  [/^cc[\s-]*by[\s-]*4\.0/i, MediaLicence.CcBy40],
  [/^cc[\s-]*by[\s-]*3\.0/i, MediaLicence.CcBy30],
  [/^cc[\s-]*by[\s-]*2\.5/i, MediaLicence.CcBy25],
  [/^cc[\s-]*by[\s-]*2\.0/i, MediaLicence.CcBy20],
  [/public\s*domain|^pd(-|\b)/i, MediaLicence.PublicDomain],
  // Explicitly not reusable on the terms Whilom needs. Recognised rather than
  // ignored, so it can be refused with a reason instead of silently dropped.
  [/fair\s*use|non[\s-]*commercial|\bnc\b|no[\s-]*deriv|\bnd\b|all\s*rights\s*reserved|copyright(ed)?\b/i,
    MediaLicence.Unsupported],
];

export interface NormalisedMedia {
  sourceFileId: string;
  sourceTitle: string;
  sourcePageUrl: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  creator: string | null;
  creatorRaw: string | null;
  licence: MediaLicence;
  licenceRaw: string | null;
  licenceUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  retrievedAt: string;
  importerVersion: string;
  /** Evidence for the proposed subject — never treated as proof of it. */
  associationEvidence: { viaCategory: string; viaQid: string; entityLabel: string };
  raw: CommonsFile;
}

/**
 * Normalise a licence string. Returns UNKNOWN when there is nothing to read —
 * an absence of evidence, which is deliberately distinct from UNSUPPORTED,
 * a licence we understand and decline.
 */
export function normaliseLicence(...candidates: (string | null | undefined)[]): MediaLicence {
  for (const candidate of candidates) {
    const value = stripHtml(candidate)?.trim();
    if (!value) continue;
    for (const [pattern, licence] of LICENCE_PATTERNS) {
      if (pattern.test(value)) return licence;
    }
  }
  return MediaLicence.Unknown;
}

export function licenceRequiresAttribution(licence: MediaLicence): boolean {
  return REQUIRES_ATTRIBUTION.has(licence);
}

export function licenceIsReusable(licence: MediaLicence): boolean {
  return REUSABLE.has(licence);
}

/**
 * Commons publishes `Artist` as HTML — usually a link. Tags are stripped and
 * entities decoded so the stored creator is plain text that can be rendered
 * safely and compared reliably.
 */
export function stripHtml(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

export function normaliseCommonsRecord(record: RawMediaRecord): NormalisedMedia {
  const file = record.file;
  const licence = normaliseLicence(file.licenceShortRaw, file.licenceRaw, file.usageTerms);

  // Artist is the proper field; Credit is a fallback some uploads use instead.
  // `creatorRaw` records whichever one the creator actually came from, so the
  // stored evidence matches the stored value rather than pointing at an empty
  // field the value did not come from.
  const fromArtist = stripHtml(file.artistRaw);
  const creator = fromArtist ?? stripHtml(file.credit);
  const creatorRaw = fromArtist !== null ? file.artistRaw : creator !== null ? file.credit : null;

  return {
    sourceFileId: file.sourceFileId,
    sourceTitle: file.title,
    sourcePageUrl: file.pageUrl,
    mediaUrl: file.mediaUrl,
    thumbnailUrl: file.thumbnailUrl,
    creator,
    creatorRaw,
    licence,
    licenceRaw: file.licenceShortRaw ?? file.licenceRaw,
    licenceUrl: file.licenceUrl,
    mimeType: file.mime,
    width: file.width,
    height: file.height,
    caption: null,
    retrievedAt: record.provenance.retrievedAt,
    importerVersion: record.provenance.importerVersion,
    associationEvidence: {
      viaCategory: file.viaCategory,
      viaQid: file.viaQid,
      entityLabel: file.entityLabel,
    },
    raw: file,
  };
}

// --- Rights readiness -------------------------------------------------------

export const MediaRightsState = {
  Ready: 'media_ready',
  RightsIncomplete: 'media_rights_incomplete',
  LicenceUnsupported: 'media_licence_unsupported',
  CreatorUnknown: 'media_creator_unknown',
  AssociationReview: 'media_association_review',
  Invalid: 'media_invalid',
} as const;
export type MediaRightsState = (typeof MediaRightsState)[keyof typeof MediaRightsState];

export interface RightsAssessment {
  state: MediaRightsState;
  missing: string[];
  attribution: string | null;
}

/**
 * Assess a file's rights the same way the database does.
 *
 * The database is the authority — `publish_media_candidate()` re-assesses at
 * publication and refuses anything not ready, so this cannot be bypassed by
 * editing a row. This exists so ingestion can report and triage before
 * anything reaches the queue.
 */
export function assessMediaRights(
  media: NormalisedMedia,
  options: { sourceName?: string; associationConfident?: boolean } = {},
): RightsAssessment {
  const missing: string[] = [];

  if (!media.mediaUrl) missing.push('media_url');
  if (!media.sourcePageUrl) missing.push('source_page_url');
  if (missing.length > 0) {
    return { state: MediaRightsState.Invalid, missing, attribution: null };
  }

  const attribution = buildAttribution(media, options.sourceName ?? 'Wikimedia Commons');

  if (media.licence === MediaLicence.Unknown) {
    return { state: MediaRightsState.RightsIncomplete, missing: ['licence'], attribution };
  }
  if (!licenceIsReusable(media.licence)) {
    return { state: MediaRightsState.LicenceUnsupported, missing: [], attribution };
  }
  if (licenceRequiresAttribution(media.licence) && !media.creator) {
    return { state: MediaRightsState.CreatorUnknown, missing: ['creator'], attribution: null };
  }
  if (attribution === null) {
    return { state: MediaRightsState.RightsIncomplete, missing: ['attribution'], attribution: null };
  }
  if (!options.associationConfident) {
    // Rights are fine; we are simply not sure enough what the file shows.
    return { state: MediaRightsState.AssociationReview, missing: [], attribution };
  }
  return { state: MediaRightsState.Ready, missing: [], attribution };
}

/**
 * Compose display attribution from stored metadata alone.
 *
 * Mirrors `public.build_media_attribution()`. Returns null when a licence
 * requires attribution and no creator is known — that null is what stops
 * publication, so it is a feature rather than a missing case.
 */
export function buildAttribution(media: NormalisedMedia, sourceName: string): string | null {
  const parts: string[] = [];
  if (media.sourceTitle) parts.push(`"${media.sourceTitle}"`);

  if (licenceRequiresAttribution(media.licence)) {
    if (!media.creator) return null;
    parts.push(`by ${media.creator}`);
  } else if (media.creator) {
    parts.push(`by ${media.creator}`);
  }

  parts.push(LICENCE_DISPLAY[media.licence]);
  if (sourceName) parts.push(`via ${sourceName}`);
  return parts.join(', ');
}

/** Display names, mirroring `media_licence_terms.display_name`. */
export const LICENCE_DISPLAY: Record<MediaLicence, string> = {
  [MediaLicence.CC0]: 'CC0 1.0',
  [MediaLicence.PublicDomain]: 'Public domain',
  [MediaLicence.CcBy20]: 'CC BY 2.0',
  [MediaLicence.CcBy25]: 'CC BY 2.5',
  [MediaLicence.CcBy30]: 'CC BY 3.0',
  [MediaLicence.CcBy40]: 'CC BY 4.0',
  [MediaLicence.CcBySa20]: 'CC BY-SA 2.0',
  [MediaLicence.CcBySa25]: 'CC BY-SA 2.5',
  [MediaLicence.CcBySa30]: 'CC BY-SA 3.0',
  [MediaLicence.CcBySa40]: 'CC BY-SA 4.0',
  [MediaLicence.OtherReusable]: 'Other reusable',
  [MediaLicence.Unsupported]: 'Not reusable',
  [MediaLicence.Unknown]: 'Unknown',
};

// --- Entity association -----------------------------------------------------

export const MediaAssociation = {
  Confident: 'media_match_confident',
  Review: 'media_match_review',
  NoMatch: 'media_no_match',
} as const;
export type MediaAssociation = (typeof MediaAssociation)[keyof typeof MediaAssociation];

export interface AssociationResult {
  outcome: MediaAssociation;
  confidence: number;
  reason: string;
}

/**
 * Decide how sure we are that a file depicts the proposed entity.
 *
 * A Commons category is evidence, not proof. A category for a large abbey
 * complex contains the abbey, the river beside it, the visitor centre, a
 * memorial, an engraving and a map — and only some of those are the abbey. So
 * a category match alone is never confident, and only a structured `depicts`
 * statement naming the entity is.
 */
export function assessAssociation(
  media: NormalisedMedia,
  options: { depictsQids?: string[]; entityQid?: string } = {},
): AssociationResult {
  const entityQid = options.entityQid ?? media.associationEvidence.viaQid;

  if (options.depictsQids?.includes(entityQid)) {
    return {
      outcome: MediaAssociation.Confident,
      confidence: 0.95,
      reason: `structured data states the file depicts ${entityQid}`,
    };
  }

  if (media.associationEvidence.viaCategory) {
    return {
      outcome: MediaAssociation.Review,
      confidence: 0.5,
      reason:
        `found via the Commons category "${media.associationEvidence.viaCategory}" named by ${entityQid}. ` +
        'A category groups files about a subject; it does not assert that each one depicts it.',
    };
  }

  return { outcome: MediaAssociation.NoMatch, confidence: 0, reason: 'no association evidence' };
}
