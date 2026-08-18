/**
 * The Whilom regional product dataset.
 *
 * ---------------------------------------------------------------------------
 * Benchmark corpus versus product dataset
 * ---------------------------------------------------------------------------
 *
 * `ingestion/scale/` defines a *benchmark* corpus: nested tiers of 1,000 to
 * 25,000 records, built by taking records in list-entry order up to a per-layer
 * quota. Quotas and prefixes are exactly right for measuring how the pipeline
 * behaves as a corpus grows, and exactly wrong for a product — "the first 3,603
 * listed buildings by list entry number" is not a place anyone lives.
 *
 * This is the *product* dataset. It takes **every** protected record inside one
 * coherent boundary, with no quota and no truncation, so the answer to "what
 * heritage is near me" is complete within the region rather than complete up to
 * an arbitrary cut-off. That completeness is the whole difference: a map with a
 * quota hole in it is worse than no map.
 */

export const REGIONAL_DATASET_ID = 'WHILOM_REGION_YORKSHIRE_V1';
export const REGIONAL_DATASET_VERSION = '1.0.0';

/**
 * Version of the rules that decide what may publish automatically.
 *
 * Recorded in the manifest because a dataset rebuilt under a different policy
 * is a different dataset, even from identical source records.
 */
export const PUBLICATION_POLICY_VERSION = '1.0.0';

/** Version of the ingestion code that produced a build. */
export const REGIONAL_IMPORTER_VERSION = '0.2.0';

/** British National Grid envelope. */
export interface GridEnvelope {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/**
 * The regional boundary.
 *
 * A 145 km x 90 km band across Yorkshire, from the Pennine watershed in the
 * west to the North Sea coast in the east. Chosen by measurement rather than
 * taste: it is the tightest coherent envelope that both lands inside the
 * 20,000-25,000 range already proven safe, and still contains all six NHLE
 * designation types — a narrower western box holds no protected wreck at all,
 * and a region that silently loses a designation type is not representative of
 * the register.
 *
 * A rectangle in the source's own coordinate system, rather than an
 * administrative polygon, so that the boundary is exactly reproducible from the
 * manifest with no dependency on a third-party geography that may be revised.
 */
export const REGIONAL_ENVELOPE: GridEnvelope = {
  xmin: 400_000,
  ymin: 420_000,
  xmax: 545_000,
  ymax: 510_000,
};

export const REGIONAL_ENVELOPE_CRS = 'EPSG:27700';

export const REGIONAL_ENVELOPE_DESCRIPTION =
  'A 145km x 90km British National Grid band across Yorkshire, running from the Pennine ' +
  'watershed east to the North Sea coast. Covers West, North, South and East Yorkshire ' +
  'together with adjoining parts of Lancashire and the Humber, and includes the coastline ' +
  'so that maritime designations are represented.';

/**
 * Layers taken, in full.
 *
 * No per-layer quota. Every record the service returns for the envelope is
 * included, which is what makes the dataset a product rather than a sample.
 */
export const REGIONAL_LAYERS = [
  { layerId: 0, layerName: 'Listed Building points', designation: 'listed_building' },
  { layerId: 6, layerName: 'Scheduled Monuments', designation: 'scheduled_monument' },
  { layerId: 7, layerName: 'Parks and Gardens', designation: 'registered_park_garden' },
  { layerId: 8, layerName: 'Battlefields', designation: 'registered_battlefield' },
  { layerId: 9, layerName: 'Protected Wreck Sites', designation: 'protected_wreck' },
  { layerId: 10, layerName: 'World Heritage Sites', designation: 'world_heritage_site' },
] as const;

export const NHLE_SERVICE_URL =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer';

/**
 * What is deliberately left out, and why.
 *
 * Stated so that a gap in the dataset can be recognised as a decision rather
 * than mistaken for a bug.
 */
export const REGIONAL_EXCLUSIONS = [
  {
    rule: 'no-identity',
    description:
      'Records with no list entry number or no name are dropped by the adapter: there is ' +
      'nothing to cite them by and nothing to call them.',
  },
  {
    rule: 'no-position',
    description:
      'Records with no easting/northing fail validation and are counted as rejected rather ' +
      'than published at a guessed location. A heritage record in the wrong field is worse ' +
      'than an absent one.',
  },
  {
    rule: 'outside-envelope',
    description: 'Records the service does not return for the envelope are simply not in the region.',
  },
  {
    rule: 'no-quota',
    description:
      'Explicitly NOT an exclusion: no per-layer cap is applied. Everything inside the ' +
      'boundary is taken, so coverage within the region is complete.',
  },
] as const;

/** Expected scale, from a returnCountOnly probe taken while defining the boundary. */
export const REGIONAL_EXPECTED_RECORDS = {
  'Listed Building points': 21_039,
  'Scheduled Monuments': 2_171,
  'Parks and Gardens': 93,
  'Battlefields': 7,
  'Protected Wreck Sites': 1,
  'World Heritage Sites': 4,
  total: 23_315,
} as const;

/** The ArcGIS query that reproduces the region, minus paging parameters. */
export function regionalSourceQuery(layerId: number): Record<string, string> {
  return {
    where: '1=1',
    geometry: JSON.stringify(REGIONAL_ENVELOPE),
    geometryType: 'esriGeometryEnvelope',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    orderByFields: 'ListEntry ASC',
    f: 'json',
    _layer: String(layerId),
  };
}
