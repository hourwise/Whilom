import { describe, expect, it } from 'vitest';
import { ExampleAdapter } from '../sources/example-adapter';

describe('ExampleAdapter', () => {
  it('emits records carrying full provenance', async () => {
    const adapter = new ExampleAdapter();
    const records = [];
    for await (const record of adapter.fetch()) {
      records.push(record);
    }
    expect(records.length).toBeGreaterThan(0);
    const [first] = records;
    expect(first?.provenance.sourceId).toBe('example');
    expect(first?.provenance.retrievedAt).toBeTruthy();
    expect(first?.provenance.importerVersion).toBeTruthy();
  });
});
