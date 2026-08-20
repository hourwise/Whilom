import { describe, expect, it } from 'vitest';
import { compositionControlledPrefix } from '../scale/national/workload-sampling';

describe('composition-controlled national sampling design', () => {
  const records = [
    { id: 'a1', stratum: 'TQ|listed' },
    { id: 'a2', stratum: 'TQ|listed' },
    { id: 'a3', stratum: 'TQ|listed' },
    { id: 'b1', stratum: 'ST|scheduled' },
    { id: 'b2', stratum: 'ST|scheduled' },
  ];

  it('is deterministic and preserves order within each stratum', () => {
    const first = compositionControlledPrefix(records, 3, (record) => record.stratum);
    const second = compositionControlledPrefix(records, 3, (record) => record.stratum);
    expect(first).toEqual(second);
    expect(first.map((record) => record.id)).toEqual(['b1', 'a1', 'a2']);
  });

  it('allocates a largest-remainder quota across strata', () => {
    const selected = compositionControlledPrefix(records, 4, (record) => record.stratum);
    expect(selected.filter((record) => record.stratum === 'TQ|listed')).toHaveLength(2);
    expect(selected.filter((record) => record.stratum === 'ST|scheduled')).toHaveLength(2);
  });

  it('does not mutate the source order or accept an oversized prefix', () => {
    expect(() => compositionControlledPrefix(records, 6, (record) => record.stratum)).toThrow();
    expect(records.map((record) => record.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });
});
