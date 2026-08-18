/**
 * Imported-media display and review helpers.
 *
 * Rights state is backend truth. Everything here explains it; nothing here
 * decides it. `publish_media_candidate()` re-assesses rights in the database at
 * publication and refuses anything not ready, so no UI state, no optimistic
 * flag and no editor action can route around the gate.
 */

export const MediaRightsState = {
  Ready: 'media_ready',
  RightsIncomplete: 'media_rights_incomplete',
  LicenceUnsupported: 'media_licence_unsupported',
  CreatorUnknown: 'media_creator_unknown',
  AssociationReview: 'media_association_review',
  Invalid: 'media_invalid',
} as const;
export type MediaRightsState = (typeof MediaRightsState)[keyof typeof MediaRightsState];

/** What a reviewer is told, and whether it is theirs to fix. */
export const RIGHTS_EXPLANATION: Record<MediaRightsState, { label: string; detail: string; fixable: boolean }> = {
  [MediaRightsState.Ready]: {
    label: 'Ready',
    detail: 'Licence, creator and attribution are all present.',
    fixable: false,
  },
  [MediaRightsState.RightsIncomplete]: {
    label: 'Rights incomplete',
    detail: 'Required rights metadata is missing, so no valid attribution can be generated.',
    fixable: false,
  },
  [MediaRightsState.LicenceUnsupported]: {
    label: 'Licence not reusable',
    detail: 'The file states a licence Whilom cannot publish under. This is not a mistake to correct.',
    fixable: false,
  },
  [MediaRightsState.CreatorUnknown]: {
    label: 'Creator unknown',
    detail: 'This licence requires the creator to be named and the file does not name one.',
    fixable: false,
  },
  [MediaRightsState.AssociationReview]: {
    label: 'Subject needs confirming',
    detail: 'Rights are fine. Confirm the image actually shows this place before publishing.',
    fixable: true,
  },
  [MediaRightsState.Invalid]: {
    label: 'Unusable record',
    detail: 'The record has no usable media or source URL.',
    fixable: false,
  },
};

/**
 * Whether the workbench should offer Publish.
 *
 * Only `media_ready` qualifies, and even then this is advisory. There is
 * deliberately no "publish anyway": rights completeness is an invariant, not a
 * warning a reviewer can dismiss, and a reviewer cannot supply a creator or a
 * licence the source did not state.
 */
export function canPublishMedia(state: string): boolean {
  return state === MediaRightsState.Ready;
}

/** The only thing a reviewer may correct here: which entity the file shows. */
export function canCorrectSubject(state: string): boolean {
  return RIGHTS_EXPLANATION[state as MediaRightsState]?.fixable ?? false;
}

export interface MediaAttribution {
  /** Generated at publication and stored; never rebuilt from the source page. */
  text: string | null;
  licenceName: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
}

/**
 * The display contract: any imported image Whilom shows must carry this.
 *
 * Returns null when attribution is absent, so a caller cannot render the image
 * and quietly omit the credit — there is nothing to render.
 */
export function mediaAttributionOrNull(rights: Partial<MediaAttribution> | null | undefined): MediaAttribution | null {
  if (!rights?.text || rights.text.trim() === '') return null;
  return {
    text: rights.text,
    licenceName: rights.licenceName ?? null,
    licenceUrl: rights.licenceUrl ?? null,
    sourceUrl: rights.sourceUrl ?? null,
  };
}

/** Decisions the media review RPC implements. Nothing else is offered. */
export const MEDIA_DECISIONS = [
  { value: 'approved', label: 'Approve association', hint: 'The image shows this place.' },
  { value: 'rejected', label: 'Reject media', hint: 'Do not use this file.' },
  { value: 'needs_review', label: 'Defer', hint: 'Leave in the queue.' },
] as const;
export type MediaDecision = (typeof MEDIA_DECISIONS)[number]['value'];

export function isMediaDecision(value: unknown): value is MediaDecision {
  return MEDIA_DECISIONS.some((d) => d.value === value);
}
