/**
 * Controlled vocabularies for the heritage graph.
 *
 * These are the canonical enum values shared by the database, the ingestion
 * pipeline and both frontends. Keep them in sync with the corresponding
 * Postgres enum/check-constraint definitions in `supabase/migrations`.
 *
 * Convention: `const` object + derived union type, so values are usable at
 * runtime (validation, filter UIs, seed data) as well as in the type system.
 */

/** The kind of entity a node in the graph represents. */
export const EntityType = {
  Place: 'place',
  Person: 'person',
  Event: 'event',
  Object: 'object',
  Route: 'route',
  Collection: 'collection',
  Source: 'source',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** Physical/typological classification of a Place (spec §4). */
export const PlaceType = {
  Castle: 'castle',
  CountryHouse: 'country_house',
  Palace: 'palace',
  Abbey: 'abbey',
  Priory: 'priory',
  Cathedral: 'cathedral',
  Church: 'church',
  Ruin: 'ruin',
  Fort: 'fort',
  Battlefield: 'battlefield',
  Hillfort: 'hillfort',
  RomanVilla: 'roman_villa',
  Settlement: 'settlement',
  IndustrialSite: 'industrial_site',
  RailwaySite: 'railway_site',
  CanalStructure: 'canal_structure',
  MilitaryInstallation: 'military_installation',
  Airfield: 'airfield',
  Bunker: 'bunker',
  Pillbox: 'pillbox',
  ArchaeologicalSite: 'archaeological_site',
  Museum: 'museum',
  Monument: 'monument',
  Garden: 'garden',
  HistoricLandscape: 'historic_landscape',
  HistoricVillage: 'historic_village',
  LostStructure: 'lost_structure',
  /**
   * An occupiable roofed building with no more specific type: houses,
   * farmhouses, cottages, terraces, barns, schools, inns, stables. Most of the
   * ~380,000 NHLE listed-building entries land here, and before this existed
   * they had no honest classification at all.
   */
  Building: 'building',
  /**
   * A built work with no more specific classification: bridges, walls, gates,
   * gate piers, railings, boundary markers, culverts, steps, street furniture,
   * engineering works. Commemorative works stay `Monument`.
   *
   * Also the deliberate catch-all. Every designated heritage record is a built
   * work of some kind, so this is always a true statement — which is why an
   * unclassifiable record lands here rather than being forced into a category
   * that claims more than is known.
   */
  Structure: 'structure',
} as const;
export type PlaceType = (typeof PlaceType)[keyof typeof PlaceType];

/** Editorial depth of a Place record (spec §6). */
export const PlaceContentLevel = {
  /** Auto-generated: name, coords, type, designation, source, map. */
  HeritageRecord: 1,
  /** Adds photos, periods, relationships, people, links, community material. */
  EnrichedRecord: 2,
  /** Full visitor destination: history, timeline, visit info, facilities. */
  VisitorDestination: 3,
  /** Premium feature/collection connecting many entities. */
  FeatureDestination: 4,
} as const;
export type PlaceContentLevel = (typeof PlaceContentLevel)[keyof typeof PlaceContentLevel];

/** Broad historical periods used for filtering and timelines. */
export const HistoricalPeriod = {
  Prehistoric: 'prehistoric',
  Roman: 'roman',
  EarlyMedieval: 'early_medieval',
  Medieval: 'medieval',
  Tudor: 'tudor',
  Stuart: 'stuart',
  Georgian: 'georgian',
  Victorian: 'victorian',
  Edwardian: 'edwardian',
  WorldWarOne: 'wwi',
  Interwar: 'interwar',
  WorldWarTwo: 'wwii',
  ColdWar: 'cold_war',
  Modern: 'modern',
} as const;
export type HistoricalPeriod = (typeof HistoricalPeriod)[keyof typeof HistoricalPeriod];

/** Kind of historical event (spec §4). */
export const EventType = {
  Battle: 'battle',
  Siege: 'siege',
  Construction: 'construction',
  Demolition: 'demolition',
  Fire: 'fire',
  RoyalVisit: 'royal_visit',
  PoliticalEvent: 'political_event',
  ArchaeologicalDiscovery: 'archaeological_discovery',
  IndustrialEvent: 'industrial_event',
  WartimeEvent: 'wartime_event',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Kind of museum/archive object (spec §4). */
export const ObjectType = {
  Artefact: 'archaeological_artefact',
  Weapon: 'weapon',
  Manuscript: 'manuscript',
  Painting: 'painting',
  Photograph: 'photograph',
  ArchitecturalFragment: 'architectural_fragment',
  Furniture: 'furniture',
  PersonalPossession: 'personal_possession',
} as const;
export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

/** Mode of a Route/trail (spec §13). */
export const RouteType = {
  Walking: 'walking',
  Hiking: 'hiking',
  UrbanWalkingTour: 'urban_walking_tour',
  Driving: 'driving',
  Cycling: 'cycling',
  MultiDayTrail: 'multi_day_trail',
} as const;
export type RouteType = (typeof RouteType)[keyof typeof RouteType];

/**
 * Provenance/trust classification for displayed information (spec §39).
 * Ordered loosely from most to least authoritative.
 */
export const TrustLevel = {
  OfficialSource: 'official_source',
  OpenDataSource: 'open_data_source',
  EditoriallyVerified: 'editorially_verified',
  CommunitySubmitted: 'community_submitted',
  CommunityReview: 'community_review',
  UnverifiedSuggestion: 'unverified_suggestion',
} as const;
export type TrustLevel = (typeof TrustLevel)[keyof typeof TrustLevel];

/** Moderation lifecycle for community + imported content (spec §17, §35). */
export const ModerationState = {
  Submitted: 'submitted',
  AutomaticallyScreened: 'automatically_screened',
  NeedsReview: 'needs_review',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;
export type ModerationState = (typeof ModerationState)[keyof typeof ModerationState];

/** Visitor cost classification (spec §9 filters). */
export const AccessCost = {
  Free: 'free',
  Paid: 'paid',
  Donation: 'donation',
  ExteriorOnly: 'exterior_only',
} as const;
export type AccessCost = (typeof AccessCost)[keyof typeof AccessCost];

/** Application role, used by RLS to gate privileged writes (spec §38). */
export const AppRole = {
  User: 'user',
  Contributor: 'contributor',
  Editor: 'editor',
  Moderator: 'moderator',
  Admin: 'admin',
} as const;
export type AppRole = (typeof AppRole)[keyof typeof AppRole];

/** Kind of citable source (spec §4 Source, §34, §39). */
export const SourceKind = {
  Official: 'official',
  OpenData: 'open_data',
  Publication: 'publication',
  Website: 'website',
  Museum: 'museum',
  Archive: 'archive',
  Editorial: 'editorial',
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

/** Statutory/heritage designation of a place (spec §6 designation/grade). */
export const DesignationType = {
  ListedBuilding: 'listed_building',
  ScheduledMonument: 'scheduled_monument',
  WorldHeritageSite: 'world_heritage_site',
  ConservationArea: 'conservation_area',
  RegisteredParkGarden: 'registered_park_garden',
  RegisteredBattlefield: 'registered_battlefield',
  ProtectedWreck: 'protected_wreck',
  Undesignated: 'undesignated',
} as const;
export type DesignationType = (typeof DesignationType)[keyof typeof DesignationType];

/** Listed-building grade (England and Wales: I, II*, II; Scotland: A, B, C). */
export const DesignationGrade = {
  I: 'I',
  IIStar: 'II*',
  II: 'II',
  A: 'A',
  B: 'B',
  C: 'C',
} as const;
export type DesignationGrade = (typeof DesignationGrade)[keyof typeof DesignationGrade];

/** On-site facilities (spec §9 facilities filters). */
export const FacilityType = {
  Parking: 'parking',
  Toilets: 'toilets',
  Cafe: 'cafe',
  Restaurant: 'restaurant',
  Shop: 'shop',
  PicnicArea: 'picnic_area',
  BabyChanging: 'baby_changing',
  AccessibleToilets: 'accessible_toilets',
  EvCharging: 'ev_charging',
  PicnicAllowed: 'picnic_allowed',
  DogFriendly: 'dog_friendly',
  Indoor: 'indoor',
  Outdoor: 'outdoor',
} as const;
export type FacilityType = (typeof FacilityType)[keyof typeof FacilityType];

/** Accessibility attributes (spec §9 accessibility filters). */
export const AccessibilityFeature = {
  WheelchairAccess: 'wheelchair_access',
  LimitedMobilitySuitable: 'limited_mobility_suitable',
  AccessibleParking: 'accessible_parking',
  StepFreeAreas: 'step_free_areas',
  PushchairSuitable: 'pushchair_suitable',
} as const;
export type AccessibilityFeature = (typeof AccessibilityFeature)[keyof typeof AccessibilityFeature];

/** Route difficulty grade (spec §13). */
export const RouteDifficulty = {
  Easy: 'easy',
  Moderate: 'moderate',
  Hard: 'hard',
  Severe: 'severe',
} as const;
export type RouteDifficulty = (typeof RouteDifficulty)[keyof typeof RouteDifficulty];

/** Transport mode for trip planning (spec §14). */
export const TransportMode = {
  Walking: 'walking',
  Cycling: 'cycling',
  Driving: 'driving',
  PublicTransport: 'public_transport',
} as const;
export type TransportMode = (typeof TransportMode)[keyof typeof TransportMode];

/** Badge grouping for the personal history system (spec §30). */
export const BadgeCategory = {
  Milestone: 'milestone',
  PlaceType: 'place_type',
  Period: 'period',
  Region: 'region',
  Trail: 'trail',
  Community: 'community',
} as const;
export type BadgeCategory = (typeof BadgeCategory)[keyof typeof BadgeCategory];

/** Kind of community contribution requiring moderation (spec §17). */
export const ContributionType = {
  Review: 'review',
  Comment: 'comment',
  Tip: 'tip',
  Photograph: 'photograph',
  Correction: 'correction',
  HistoricalClaim: 'historical_claim',
  NewPlaceSuggestion: 'new_place_suggestion',
  RelationshipSuggestion: 'relationship_suggestion',
} as const;
export type ContributionType = (typeof ContributionType)[keyof typeof ContributionType];

/** Reason a piece of content was reported (spec §16, §29). */
export const ReportReason = {
  IncorrectInformation: 'incorrect_information',
  IncorrectAccess: 'incorrect_access',
  BlockedPath: 'blocked_path',
  FacilityCorrection: 'facility_correction',
  Inappropriate: 'inappropriate',
  Spam: 'spam',
  CopyrightConcern: 'copyright_concern',
  Other: 'other',
} as const;
export type ReportReason = (typeof ReportReason)[keyof typeof ReportReason];

/**
 * How a stored coordinate was arrived at (spec §34 provenance).
 *
 * Paired with an accuracy in metres. The two answer different questions: the
 * method says what kind of claim the coordinate is, the accuracy says how big
 * the doubt is. A `geometry_centroid` for a large monastic precinct is a
 * perfectly good coordinate and also several hundred metres from most of the
 * things a visitor would actually go to see.
 *
 * This is NOT a measure of transformation precision. Converting a British
 * National Grid reference to WGS84 exactly does not make the input coordinate
 * describe the real site exactly.
 */
export const LocationMethod = {
  /** Measured on the ground or taken from an authoritative survey. */
  Surveyed: 'surveyed',
  /** A point coordinate published by an authoritative source for this feature. */
  SourceCoordinate: 'source_coordinate',
  /** Centre of the feature's real extent, as judged by a source or an editor. */
  FeatureCentroid: 'feature_centroid',
  /** Centroid of a published geometry; accuracy is governed by feature size. */
  GeometryCentroid: 'geometry_centroid',
  AddressGeocoded: 'address_geocoded',
  /** UK postcode centroids are typically 50-500 m out, and worse rurally. */
  PostcodeCentroid: 'postcode_centroid',
  /** Placed by hand by an editor, e.g. from a historic map. */
  Manual: 'manual',
  /** Known to be rough because the source said so. */
  Approximate: 'approximate',
  /** Provenance genuinely unknown — distinct from "not yet assessed" (null). */
  Unknown: 'unknown',
} as const;
export type LocationMethod = (typeof LocationMethod)[keyof typeof LocationMethod];

/** Type of user-owned list (spec §16 collections). */
export const WishlistKind = {
  Wishlist: 'wishlist',
  Favourites: 'favourites',
  Custom: 'custom',
} as const;
export type WishlistKind = (typeof WishlistKind)[keyof typeof WishlistKind];
