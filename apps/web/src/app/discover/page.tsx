import { AccessCost, HistoricalPeriod, PlaceType } from '@whilom/domain';
import { searchPlaces, type DiscoverParams } from '@/lib/data';
import { PlaceCard } from '@/components/PlaceCard';

export const metadata = { title: 'Discover' };

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Only expose a manageable subset of place types in the MVP filter.
const TYPE_OPTIONS = [
  PlaceType.Castle,
  PlaceType.CountryHouse,
  PlaceType.Abbey,
  PlaceType.Priory,
  PlaceType.Church,
  PlaceType.Cathedral,
  PlaceType.Ruin,
  PlaceType.Battlefield,
  PlaceType.Hillfort,
  PlaceType.RomanVilla,
  PlaceType.IndustrialSite,
  PlaceType.Museum,
  PlaceType.Monument,
  PlaceType.Garden,
  PlaceType.HistoricVillage,
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverParams>;
}) {
  const params = await searchParams;

  let results = [] as Awaited<ReturnType<typeof searchPlaces>>;
  let error = false;
  try {
    results = await searchPlaces(params);
  } catch {
    error = true;
  }

  return (
    <div className="stack">
      <h1>Discover</h1>

      <form className="filters" method="get" action="/discover">
        <div>
          <label htmlFor="text">Search</label>
          <input id="text" name="text" defaultValue={params.text ?? ''} placeholder="Name or town" />
        </div>
        <div>
          <label htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={params.type ?? ''}>
            <option value="">Any</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="period">Period</label>
          <select id="period" name="period" defaultValue={params.period ?? ''}>
            <option value="">Any</option>
            {Object.values(HistoricalPeriod).map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cost">Cost</label>
          <select id="cost" name="cost" defaultValue={params.cost ?? ''}>
            <option value="">Any</option>
            {Object.values(AccessCost).map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="visitable">Visitable only</label>
          <select id="visitable" name="visitable" defaultValue={params.visitable ?? ''}>
            <option value="">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
        <div>
          <button type="submit">Apply</button>
        </div>
      </form>

      {error && (
        <p className="error">
          Could not reach the database. Start the Supabase stack and set the env vars, then retry.
        </p>
      )}

      {!error && (
        <>
          <p className="muted">
            {results.length} result{results.length === 1 ? '' : 's'}
          </p>
          <div className="grid">
            {results.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
          {results.length === 0 && <p className="muted">No places match those filters.</p>}
        </>
      )}
    </div>
  );
}
