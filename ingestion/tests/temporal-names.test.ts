/**
 * What may and may not be read out of a listing name.
 *
 * Every string in this file is a real name from the Yorkshire regional corpus.
 * That matters: the traps here are not hypothetical bad inputs invented to make
 * a parser look careful, they are what Historic England actually publishes, and
 * a naive year-grabber gets roughly a third of them wrong.
 */

import { describe, expect, it } from 'vitest';
import { extractTemporalClaims } from '../transforms/temporal';

describe('a year the record says is a date', () => {
  it('reads a datestone', () => {
    const claims = extractTemporalClaims('Cow Byre Dated 1675');
    expect(claims).toHaveLength(1);
    expect(claims[0]!.startYear).toBe(1675);
    expect(claims[0]!.precision).toBe('exact_year');
    expect(claims[0]!.associationType).toBe('built');
  });

  it('maps the year onto the period a filter can find it by', () => {
    expect(extractTemporalClaims('Farm Building Dated 1632 Approximately 20 Metres East')[0]!.periodId)
      .toBe('stuart');
  });

  it('reads a death year off a funerary monument', () => {
    const claims = extractTemporalClaims('Tombstone of Thomas Roodes, Died 1706, to Left of Porch');
    expect(claims[0]!.startYear).toBe(1706);
  });

  it('reads every dated phase, not merely the first', () => {
    // Two grave slabs, two different years, one listing.
    const claims = extractTemporalClaims(
      '2 Raised Grave Slabs One to John Scott Dated 1744 the Other to Gregory Tomlinson Dated 1681',
    );
    expect(claims.map((c) => c.startYear).sort()).toEqual([1681, 1744]);
  });
});

describe('four-digit numbers that are not years', () => {
  // These are the reason a bare year is never read. Each is a real listing.
  it.each([
    ['Boundary Stone at 2010 2955', 'a grid reference'],
    ['Well Head at Se 1485 4918', 'a grid reference with its sheet letters'],
    ['Warehouse at Ngr 1914 2530', 'an explicit NGR'],
    ['1189-1195, THORNTON ROAD BD13 (See details for further address information)', 'a house-number range'],
    ['1035 and 1037, Great Horton Road', 'two house numbers'],
    ['1049 and 1051, York Road', 'two more house numbers'],
    ['York Cemetery Plot Number 1977 Terry Monument', 'a plot number'],
    ['Milepost Approximately 90 Metres South West of Elland Lock at Se 1101 2181', 'a grid reference'],
  ])('refuses %s (%s)', (name) => {
    expect(extractTemporalClaims(name)).toEqual([]);
  });

  it('refuses a road number that looks like a century', () => {
    expect(extractTemporalClaims('Milepost 159 Metres North East of the Junction With the C61 Road'))
      .toEqual([]);
  });

  it('refuses circa when it is qualifying a distance', () => {
    expect(extractTemporalClaims('Mile Post Circa 320 Metres North East of Wragby')).toEqual([]);
    expect(extractTemporalClaims('Outbuilding Circa 50 Yards East of York House')).toEqual([]);
  });
});

describe('centuries, qualified and repeated', () => {
  it('records both phases a castle names', () => {
    const claims = extractTemporalClaims(
      'Pickering Castle: 11th century motte and bailey castle and 13th century shell keep castle',
      { descriptiveSource: true },
    );
    const spans = claims.filter((c) => c.precision === 'century').map((c) => c.startYear).sort();
    expect(spans).toContain(1001);
    expect(spans).toContain(1201);
  });

  it('keeps a qualifier without sharpening the claim', () => {
    const claims = extractTemporalClaims(
      "Stanley Royd Hospital Eastern Part of Main Range Comprising Early C19 Former Paupers' Lunatic Asylum",
    );
    const century = claims.find((c) => c.precision === 'century');
    expect(century?.qualifier).toBe('early');
    expect(century?.label).toBe('early 19th century');
    expect(century?.startYear).toBe(1801);
  });

  it('reads the hyphenated form the register writes', () => {
    const claims = extractTemporalClaims(
      'Bootham Park Hospital: front range, 1886 link block, late-C18 building, 1817 range and 1908 extension',
    );
    expect(claims.find((c) => c.precision === 'century')?.qualifier).toBe('late');
  });

  it('still reads a bare century wherever it appears', () => {
    expect(extractTemporalClaims('Wall incorporating C18 water supply point')[0]!.startYear).toBe(1701);
  });

  it.each([
    'C1827',
    'C1854',
    'C1800',
    'C1901',
    'NHLE-C18X identifier',
    'PAIR OF CHEST TOMBS TO THE ASQUITH FAMILY C1827 AND 1854 APPROXIMATELY 25 METRES NORTH WEST OF WEST DOOR OF CHURCH OF ST MARY',
  ])('does not extract a century from a larger token: %s', (name) => {
    expect(extractTemporalClaims(name).filter((claim) => claim.precision === 'century')).toEqual([]);
  });

  it.each([
    'C18',
    'C18.',
    'C18?',
    'late C18',
    'late-C18',
    'Early C19',
    'late 17th century',
  ])('keeps a supported century token at a valid boundary: %s', (name) => {
    expect(extractTemporalClaims(name).find((claim) => claim.precision === 'century')).toBeDefined();
  });
});

describe('a battle is an event, not a building', () => {
  it('records the year as an event when the source is a battlefield', () => {
    const claims = extractTemporalClaims('Battle of Marston Moor 1644', { eventSource: true });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.associationType).toBe('event');
    expect(claims[0]!.startYear).toBe(1644);
  });

  it('does not claim somebody constructed a moor', () => {
    const claims = extractTemporalClaims('Battle of Marston Moor 1644', { eventSource: true });
    expect(claims.every((c) => c.associationType !== 'built')).toBe(true);
  });

  it('reads the earliest battles the register holds', () => {
    expect(extractTemporalClaims('Battle of Stamford Bridge 1066', { eventSource: true })[0]!.periodId)
      .toBe('norman');
    expect(extractTemporalClaims('Battle of Northallerton 1138', { eventSource: true })[0]!.periodId)
      .toBe('norman');
  });

  it('reads no bare year at all when the record is not an event source', () => {
    expect(extractTemporalClaims('Battle of Marston Moor 1644')).toEqual([]);
  });
});

describe('every claim carries what it needs to be audited', () => {
  it('states the rules that produced it and what it may say', () => {
    const [claim] = extractTemporalClaims('Cow Byre Dated 1675');
    expect(claim!.normaliserVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(claim!.label).toBe('1675');
    expect(claim!.originalText).toMatch(/Dated 1675/i);
    expect(claim!.derivation.length).toBeGreaterThan(0);
  });
});
