import { describe, expect, it } from 'vitest';
import { compositionControlledPrefix, stableSampleDigest } from '../scale/national/workload-sampling';

describe('composition-controlled sample digests', () => {
  const records = [
    { reference: '0:100', stratum: 'TQ|listed' },
    { reference: '6:200', stratum: 'TQ|scheduled' },
    { reference: '0:101', stratum: 'TQ|listed' },
    { reference: '7:300', stratum: 'ST|park' },
  ];

  it('produces a stable digest for the same deterministic sample', () => {
    const sample = compositionControlledPrefix(records, 3, (record) => record.stratum);
    const first = stableSampleDigest(sample, (record) => record.reference);
    const second = stableSampleDigest(
      compositionControlledPrefix(records, 3, (record) => record.stratum),
      (record) => record.reference,
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when stable sample ordering changes', () => {
    const sample = compositionControlledPrefix(records, 3, (record) => record.stratum);
    expect(stableSampleDigest(sample, (record) => record.reference)).not.toBe(
      stableSampleDigest([...sample].reverse(), (record) => record.reference),
    );
  });
});
