# Wikimedia Commons

Whilom's first external **media** source.

Commons proposes pictures of entities Whilom already knows. It never proposes
new canonical places: a file depicts something, it is not itself a heritage
site, and this adapter has no path to creating one.

## Access mechanism

The official **MediaWiki Action API**, `https://commons.wikimedia.org/w/api.php`.
No credentials required.

```
action=query&list=categorymembers&cmtitle=Category:<name>&cmtype=file
action=query&titles=<files>&prop=imageinfo&iiprop=url|extmetadata|mime|size|user
```

The category comes from the entity's own Wikidata item (`P373`), which is why
association starts from a QID rather than from a filename. Per-file rights live
in the `extmetadata` block: `Artist`, `LicenseShortName`, `LicenseUrl`,
`Credit`, `UsageTerms`, `AttributionRequired`.

Ordinary Commons HTML pages are **not** scraped, and no Wikipedia article prose
is imported.

### Rate limiting

The anonymous Action API returns **HTTP 429** on bursts. The first capture run
was cut off after five categories. Requests are therefore serialised with about
1.2 s between calls and retried with exponential backoff. This is a real bound
on ingestion throughput and is recorded here rather than hidden: any future
scale work has to plan around it, or authenticate.

## Licensing

**There is no single Commons licence.** Commons hosts everything from CC0 to
non-reusable fair-use material, and the licence is a property of each file. The
bounded 40-file sample alone contains six:

| Licence | Files |
| --- | --- |
| CC BY-SA 2.0 | 21 |
| Public domain | 10 |
| CC BY-SA 4.0 | 3 |
| CC BY 2.0 | 3 |
| CC BY-SA 3.0 | 2 |
| CC BY 3.0 | 1 |

Licences are normalised into the `media_licence` vocabulary so reusability is a
decision about a known value, and the raw string is always retained alongside as
the evidence for that decision. `UNKNOWN` (no readable rights) is deliberately
distinct from `UNSUPPORTED` (a licence we understand and decline).

## The rights gate

A file is publishable only when Whilom can generate valid attribution for that
exact file from stored data. `build_media_attribution()` returns NULL when a
licence requires a creator and none is stated, and
`publish_media_candidate()` refuses anything that is not `media_ready` —
re-assessing at publication, so a stale or hand-edited state buys nothing.

States: `media_ready`, `media_rights_incomplete`, `media_licence_unsupported`,
`media_creator_unknown`, `media_association_review`, `media_invalid`.

## Association

A Commons category is **evidence, not proof**. The category for a large abbey
complex contains the abbey, the river beside it, the visitor centre, a memorial,
an engraving and a map — and only some of those depict the abbey. So:

- `media_match_confident` — structured data states the file depicts the entity.
- `media_match_review` — found via the entity's category, and nothing more.
- `media_no_match` — no association evidence.

Only `media_match_confident` can publish. Rights-perfect media with an uncertain
subject waits for a human, because a correctly licensed photograph of the wrong
place is still the wrong place.

## Fixtures

- `fixtures/yorkshire-commons.json` — **40 real files** across 14 canonical
  Yorkshire entities, captured from the API above with rights metadata
  unmodified.
- `fixtures/rights-cases.json` — 12 deterministic cases a bounded live sample
  may not happen to contain: missing creator, missing licence, malformed
  licence, non-reusable licence, missing source URL, ambiguous association,
  strong association, multiple subjects, CC0. They run through the same adapter,
  normaliser and rights assessor as live data — there is no test-only path.
