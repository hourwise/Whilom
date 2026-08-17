import type { DesignationType } from '@whilom/domain';

/**
 * The layers of the NHLE FeatureServer, and what each one means to Whilom.
 *
 * Field names differ per layer — the date a record was protected is `ListDate`
 * on listed buildings, `SchedDate` on scheduled monuments, `RegDate` on parks
 * and battlefields and `InscrDate` on World Heritage Sites — so the layer
 * registry, not the parser, owns that knowledge.
 */

export interface NhleLayer {
  layerId: number;
  layerName: string;
  /** The statutory designation records in this layer carry. */
  designation: DesignationType;
  /** Attribute holding the date protection was first conferred. */
  designatedDateField: string;
  /** True when the layer publishes a `Grade` attribute. */
  hasGrade: boolean;
}

export const NHLE_LAYERS: readonly NhleLayer[] = [
  {
    layerId: 0,
    layerName: 'Listed Building points',
    designation: 'listed_building',
    designatedDateField: 'ListDate',
    hasGrade: true,
  },
  {
    layerId: 6,
    layerName: 'Scheduled Monuments',
    designation: 'scheduled_monument',
    designatedDateField: 'SchedDate',
    hasGrade: false,
  },
  {
    layerId: 7,
    layerName: 'Parks and Gardens',
    designation: 'registered_park_garden',
    designatedDateField: 'RegDate',
    hasGrade: true,
  },
  {
    layerId: 8,
    layerName: 'Battlefields',
    designation: 'registered_battlefield',
    designatedDateField: 'RegDate',
    hasGrade: false,
  },
  {
    layerId: 9,
    layerName: 'Protected Wreck Sites',
    designation: 'protected_wreck',
    designatedDateField: 'RegDate',
    hasGrade: false,
  },
  {
    layerId: 10,
    layerName: 'World Heritage Sites',
    designation: 'world_heritage_site',
    designatedDateField: 'InscrDate',
    hasGrade: false,
  },
];

/**
 * Layers 1/2 (Building Preservation Notices, Certificates of Immunity) are
 * intentionally absent: neither is a heritage designation — a COI is a
 * guarantee a building will *not* be listed — so importing them as designations
 * would be a factual error. Layers 3/4/5 are polygon duplicates of 0/1/2 and
 * would double-count every listed building.
 */
export const DELIBERATELY_UNSUPPORTED_LAYERS: Readonly<Record<number, string>> = {
  1: 'Building Preservation Notice points — temporary protection, not a designation',
  2: 'Certificate of Immunity points — a guarantee against listing, not a designation',
  3: 'Listed Building polygons — duplicates layer 0',
  4: 'Building Preservation Notices polygons — duplicates layer 1',
  5: 'Certificate of Immunity polygons — duplicates layer 2',
};

export function findLayer(layerId: number): NhleLayer | undefined {
  return NHLE_LAYERS.find((l) => l.layerId === layerId);
}
