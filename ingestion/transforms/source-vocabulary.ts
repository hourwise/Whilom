/**
 * The source terms Whilom governs, and what each one is allowed to become.
 *
 * ---------------------------------------------------------------------------
 * Why this is a list and not a rule
 * ---------------------------------------------------------------------------
 *
 * Every entry here was measured before it was written. The audit in
 * `ingestion/regional/coverage-opportunity.ts` counted what the sources
 * actually say across the regional corpus, and this file governs exactly those
 * terms and no others. Nothing is here because it seemed likely.
 *
 * That matters most for what is REJECTED. Wikidata's `significant event`
 * property carries thirty-three distinct dated event types in this region, and
 * several of them date a modern investigation rather than the place:
 * a geophysical survey in 2015, an archaeological excavation in 1998, a UNESCO
 * record modification. Importing those as temporal evidence would place a
 * Bronze Age barrow in the twenty-first century — a defect that would look
 * exactly like data until somebody read it.
 *
 * ---------------------------------------------------------------------------
 * Classification
 * ---------------------------------------------------------------------------
 *
 * Each source term carries how it relates to Whilom's period registry, so a
 * mapping can be argued with rather than merely trusted.
 */

export const VOCABULARY_VERSION = '1.0.0';

/** How a source term relates to Whilom's governed period registry. */
export type VocabularyClassification =
  /** The source term is a registry period under the same name. */
  | 'DIRECT_REGISTRY_MATCH'
  /** A different name for a registry period. */
  | 'CONTROLLED_ALIAS'
  /** Spans more than one registry period; must not be narrowed to one. */
  | 'BROADER_THAN_REGISTRY'
  /** Sits inside a registry period; may be represented at registry precision. */
  | 'NARROWER_THAN_REGISTRY'
  /** Could mean more than one thing; goes to quarantine. */
  | 'AMBIGUOUS'
  /** Recognised but not yet governed; goes to quarantine and is ranked. */
  | 'UNMAPPED'
  /** Deliberately refused, with a reason. */
  | 'REJECTED';

export interface PeriodTerm {
  /** Wikidata item id, which is the identity — labels change. */
  qid: string;
  /** The source's own label, preserved on every claim produced. */
  label: string;
  classification: VocabularyClassification;
  /**
   * The registry period, when the term maps to exactly one.
   *
   * Null for BROADER_THAN_REGISTRY: a term covering several periods must not
   * be narrowed to whichever one happens to overlap it most. The span is kept
   * instead, and matching works from the span.
   */
  periodId: string | null;
  /** Signed years, historical convention. Used when periodId is null. */
  span: { start: number; end: number } | null;
  note: string;
}

/**
 * Wikidata `time period` (P2348) items measured on regional NHLE entries.
 *
 * Five distinct items across 79 regional records. Small, and worth governing
 * precisely because it is the only *controlled* period vocabulary either source
 * offers — everything else is a word read out of a name.
 */
export const PERIOD_TERMS: PeriodTerm[] = [
  {
    qid: 'Q12554',
    label: 'Middle Ages',
    classification: 'BROADER_THAN_REGISTRY',
    periodId: null,
    // Whilom splits this era into early_medieval (410–1065), norman (1066–1153)
    // and medieval (1154–1484). "Middle Ages" covers all three, so pinning it
    // to `medieval` would silently narrow a claim the source never narrowed.
    span: { start: 410, end: 1484 },
    note: 'spans early_medieval, norman and medieval; kept as a span rather than narrowed to one of them',
  },
  {
    qid: 'Q131987978',
    label: 'Romano-British period',
    classification: 'CONTROLLED_ALIAS',
    periodId: 'roman',
    span: null,
    note: 'the British provincial name for the Roman period',
  },
  {
    qid: 'Q277399',
    label: 'British Iron Age',
    classification: 'CONTROLLED_ALIAS',
    periodId: 'iron_age',
    span: null,
    note: 'the British regional name for the Iron Age',
  },
  {
    qid: 'Q44155',
    label: 'Mesolithic',
    classification: 'DIRECT_REGISTRY_MATCH',
    periodId: 'mesolithic',
    span: null,
    note: 'registry period under the same name',
  },
  {
    qid: 'Q11764',
    label: 'Iron Age',
    classification: 'DIRECT_REGISTRY_MATCH',
    periodId: 'iron_age',
    span: null,
    note: 'registry period under the same name',
  },
];

/**
 * What a dated event says about a place — or refuses to say.
 *
 * `association` maps onto `public.temporal_association_type`. `null` means the
 * event is real and dated but tells Whilom nothing about the place's own
 * history, so it is quarantined rather than imported.
 */
export interface EventTerm {
  qid: string;
  label: string;
  association: 'built' | 'altered' | 'lost' | 'event' | null;
  /** Why, in words, so a rejection can be argued with. */
  note: string;
}

/**
 * Wikidata `significant event` (P793) types carrying a dated qualifier,
 * measured across the regional corpus.
 *
 * The split that matters is the last group. An archaeological excavation in
 * 1998 is a dated fact about archaeologists, not about the monument, and a
 * survey date attached to a Bronze Age barrow would put it in the twentieth
 * century. Those are refused by name.
 */
export const EVENT_TERMS: EventTerm[] = [
  // --- Construction -------------------------------------------------------
  { qid: 'Q27136782', label: 'start of construction', association: 'built', note: 'construction began' },
  { qid: 'Q59913255', label: 'end of construction', association: 'built', note: 'construction completed' },
  { qid: 'Q1068633', label: 'groundbreaking ceremony', association: 'built', note: 'construction began' },

  // --- Alteration ---------------------------------------------------------
  { qid: 'Q1370468', label: 'architectural reconstruction', association: 'altered', note: 'the fabric was rebuilt' },
  { qid: 'Q2478058', label: 'reconstruction', association: 'altered', note: 'the fabric was rebuilt' },
  { qid: 'Q106334491', label: 'building modification', association: 'altered', note: 'the fabric was changed' },
  { qid: 'Q19841649', label: 'expansion', association: 'altered', note: 'the fabric was extended' },
  { qid: 'Q2144402', label: 'renovation', association: 'altered', note: 'the fabric was renewed' },
  { qid: 'Q1441983', label: 'redevelopment', association: 'altered', note: 'the fabric was redeveloped' },
  { qid: 'Q112233843', label: 'widening', association: 'altered', note: 'the fabric was widened' },

  // --- Loss ---------------------------------------------------------------
  { qid: 'Q331483', label: 'demolition', association: 'lost', note: 'the structure was demolished' },
  { qid: 'Q906512', label: 'shipwrecking', association: 'lost', note: 'the vessel was wrecked' },

  // --- Things that happened here ------------------------------------------
  { qid: 'Q2238935', label: 'slighting', association: 'event', note: 'deliberate damage to a fortification' },
  { qid: 'Q168983', label: 'conflagration', association: 'event', note: 'a fire' },
  { qid: 'Q188055', label: 'siege', association: 'event', note: 'a siege' },
  { qid: 'Q7944', label: 'earthquake', association: 'event', note: 'an earthquake' },
  { qid: 'Q6543023', label: 'licence to crenellate', association: 'event', note: 'royal licence to fortify' },
  { qid: 'Q125375', label: 'consecration', association: 'event', note: 'consecrated' },
  { qid: 'Q16635429', label: 'deconsecration', association: 'event', note: 'deconsecrated' },
  { qid: 'Q55651798', label: 'unveiling', association: 'event', note: 'unveiled' },
  { qid: 'Q596643', label: 'ship launching', association: 'event', note: 'launched' },
  { qid: 'Q1306940', label: 'first light', association: 'event', note: 'first lit' },
  { qid: 'Q27229605', label: 'moved', association: 'event', note: 'the structure was moved' },
  { qid: 'Q826949', label: 'structure relocation', association: 'event', note: 'the structure was moved' },
  { qid: 'Q33316032', label: 'moved building', association: 'event', note: 'the structure was moved' },
  { qid: 'Q2918584', label: 'relocation', association: 'event', note: 'the structure was moved' },

  // --- Dated, real, and NOT about the place's own history ------------------
  // These are the reason this file is a governed list rather than a pass-through.
  {
    qid: 'Q3610005',
    label: 'geophysical survey',
    association: null,
    note: 'dates the survey, not the site; a 2015 survey of a Bronze Age barrow says nothing about the barrow',
  },
  {
    qid: 'Q959782',
    label: 'archaeological excavation',
    association: null,
    note: 'dates the excavation, not the site',
  },
  {
    qid: 'Q1144458',
    label: 'archaeological field survey',
    association: null,
    note: 'dates the survey, not the site',
  },
  {
    qid: 'Q112127197',
    label: 'topographical survey',
    association: null,
    note: 'dates the survey, not the site',
  },
  {
    qid: 'Q29778318',
    label: 'UNESCO World Heritage Site record modification',
    association: null,
    note: 'an administrative act, in the same family as the designation dates the register already refuses',
  },
  {
    qid: 'Q24410992',
    label: 'automatization',
    association: null,
    note: 'a lighthouse being automated is an operational change, not a date for the structure',
  },
  {
    qid: 'Q34581',
    label: 'childbirth',
    association: null,
    note: 'dates a person, not the building they were born in',
  },
];

const PERIOD_BY_QID = new Map(PERIOD_TERMS.map((t) => [t.qid, t]));
const EVENT_BY_QID = new Map(EVENT_TERMS.map((t) => [t.qid, t]));

export function periodTerm(qid: string): PeriodTerm | null {
  return PERIOD_BY_QID.get(qid) ?? null;
}

export function eventTerm(qid: string): EventTerm | null {
  return EVENT_BY_QID.get(qid) ?? null;
}

/**
 * Properties refused outright, with the reason.
 *
 * `architectural style` is the important one: 517 regional records carry it,
 * which makes it the largest single body of apparently-temporal Wikidata
 * evidence available — and it is not temporal evidence at all. "Decorated
 * Gothic" correlates with a date and does not assert one, and a building in a
 * revival style is deliberate counter-evidence: a Norman-revival church is
 * Victorian.
 */
export const REJECTED_PROPERTIES = [
  {
    property: 'P149',
    label: 'architectural style',
    regionalRecords: 517,
    reason: 'STYLE_NOT_DATE',
    note:
      'a style correlates with a period and does not assert one; revival styles invert the correlation ' +
      'outright, so a Norman-revival church would be dated to the twelfth century instead of the nineteenth',
  },
  {
    property: 'P1435',
    label: 'heritage designation',
    regionalRecords: 55133,
    reason: 'DESIGNATION_NOT_HISTORIC',
    note: 'designation is an act of the state, the same class of value the register\'s own date fields carry',
  },
] as const;
