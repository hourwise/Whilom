# Governance blockers

First-class blockers that future batches must not silently rediscover. Each records what was tried, what was found, and what is forbidden until a human resolves it.

---

## Historic England — individual NHLE listing descriptions

**Status:** `ACCESS_OR_LICENSING_REVIEW_REQUIRED`

**Engineering status:** No technical ingestion authorised.

### What this source is

The prose Historic England writes for each list entry — "Farmhouse. C17, altered C19..." — is the single largest temporal opportunity available to Whilom. The temporal normaliser already reads that grammar. The blocker is entirely one of access, not engineering.

### Why it is blocked (measured, Batches 12–13)

- The NHLE FeatureServer publishes **11 layers with 23 distinct fields between them.** None is the description text; every date field records an act of the state (`ListDate`, `SchedDate`, `RegDate`, `InscrDate`, `DesigDate`, `AmendDate`).
- **All 247 feature services Historic England publishes were enumerated.** None carries the listing description.
- The text exists only on individual list-entry web pages, reachable via the `hyperlink` field — approximately **400,000 pages** nationally.
- `historicengland.org.uk` returned **HTTP 403 to a non-browser request, including for `robots.txt`.** The crawl policy itself could not be read, so bulk-access permission and applicable terms are unverified.
- The spatial data's OGL v3.0 licence covers the spatial data. It cannot be assumed to extend to website prose.

### Required next action

Human contact — written access or licensing clarification from Historic England — establishing whether the description text may be retrieved in bulk and under what terms.

### Forbidden until then

- Scraping bypasses of the 403.
- Browser impersonation or alternate user agents to appear as a browser.
- Proxy circumvention or unofficial mirrors.
- Treating a page's accessibility in a browser as permission for bulk ingestion.

This was confirmed unchanged in Batch 13. **Do not spend implementation time re-auditing it.** When the licensing position changes, this record is where the answer belongs.
