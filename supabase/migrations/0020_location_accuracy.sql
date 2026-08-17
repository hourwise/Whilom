-- 0020_location_accuracy.sql
-- Say how well we actually know where a place is.
--
-- `places.location` is a PostGIS point, and a point is a claim of infinite
-- precision. That claim is false for most heritage data. Historic England
-- publishes a single easting/northing for a 33-hectare abbey precinct; that
-- coordinate is the centroid of a polygon, not the location of a building, and
-- storing it as a bare point loses the difference between it and a surveyed
-- doorway.
--
-- IMPORTANT DISTINCTION, and the reason this migration exists:
--
--   Coordinate-transformation accuracy is NOT source-feature positional
--   accuracy.
--
-- Whilom's British National Grid → WGS84 conversion is pinned to the Ordnance
-- Survey worked example at 0.44 mm. That proves the *arithmetic* is right. It
-- says nothing whatever about whether the input coordinate describes the real
-- site to 0.44 mm — for a polygon centroid the honest figure is hundreds of
-- metres. Conflating the two would let a precise conversion of a vague input
-- masquerade as a precise location, which is exactly the kind of false
-- precision the trust model exists to prevent.

-- ---------------------------------------------------------------------------
-- How a coordinate was arrived at.
-- ---------------------------------------------------------------------------
create type public.location_method as enum (
  -- Measured on the ground or taken from an authoritative survey.
  'surveyed',
  -- A point coordinate published by an authoritative source for this feature.
  'source_coordinate',
  -- Centre of the real-world feature's extent, as judged by a source or editor.
  'feature_centroid',
  -- Centroid computed from a published geometry (polygon, multipoint, line).
  -- Accuracy here is governed by the size of the feature, not the maths.
  'geometry_centroid',
  -- Derived from a street address.
  'address_geocoded',
  -- Derived from a postcode; in the UK this is typically 50-500 m out, and
  -- much worse in rural areas where a postcode can span a whole village.
  'postcode_centroid',
  -- Placed by hand by an editor, e.g. from a historic map.
  'manual',
  -- Known to be rough; the source itself said so.
  'approximate',
  -- Provenance genuinely not known. Distinct from NULL, which means "nobody
  -- has looked at this yet".
  'unknown'
);

comment on type public.location_method is
  'How a stored coordinate was derived. Governs how far it can be trusted; see location_accuracy_m for the magnitude.';

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------
alter table public.places
  add column location_method public.location_method,
  add column location_accuracy_m numeric(9, 1)
    check (location_accuracy_m is null or location_accuracy_m >= 0);

comment on column public.places.location_method is
  'How location was derived. NULL means not yet assessed, which is not the same as ''unknown''.';
comment on column public.places.location_accuracy_m is
  'Estimated positional uncertainty radius in metres: the real feature is expected to lie within roughly this distance of `location`. NULL when unknown. Never a transformation-precision figure.';

-- Discovery can then avoid presenting a 300 m centroid as a pin on a doorway.
create index places_location_accuracy_idx on public.places (location_accuracy_m)
  where location_accuracy_m is not null;

-- ---------------------------------------------------------------------------
-- source_records: what the source actually gave us, before we touched it.
--
-- Kept separate from the canonical columns above on purpose. `places` holds
-- Whilom's current best estimate; each source record holds that source's own
-- claim, so a later source disagreeing does not erase what the first one said.
-- ---------------------------------------------------------------------------
alter table public.source_records
  -- The coordinate exactly as published, in the source's own reference system.
  add column source_lng double precision,
  add column source_lat double precision,
  -- e.g. 'EPSG:27700' for the British National Grid. NULL when the source
  -- published WGS84 or published no coordinate at all.
  add column source_crs text,
  -- Original values in the source CRS, retained so the conversion can be
  -- re-run or audited without re-fetching, e.g. {"easting":427487,"northing":468286}.
  add column source_coordinates jsonb,
  -- Identifies the transformation used, e.g.
  -- 'osgb36-to-wgs84/helmert-7param@0.1.0'. Version included so a later,
  -- better transform (OSTN15) is distinguishable from this one.
  add column coordinate_conversion text,
  -- Precision the source itself stated, in metres, if any. Distinct from our
  -- own estimate: a source claiming 1 m does not make it true.
  add column source_precision_m numeric(9, 1)
    check (source_precision_m is null or source_precision_m >= 0),
  -- Whilom's estimate for this source's coordinate, on the same basis as
  -- places.location_accuracy_m.
  add column location_accuracy_m numeric(9, 1)
    check (location_accuracy_m is null or location_accuracy_m >= 0),
  add column location_method public.location_method;

comment on column public.source_records.source_crs is
  'Coordinate reference system the source published in, e.g. EPSG:27700. Retained so a conversion is reproducible.';
comment on column public.source_records.coordinate_conversion is
  'Identifier and version of the transformation applied. Transformation precision is not positional accuracy.';
comment on column public.source_records.source_precision_m is
  'Precision asserted by the source itself, if any. Not Whilom''s estimate.';
