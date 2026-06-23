"""
One-off: re-categorize articles that were WRONGLY tagged 'Editorial' by the
extractor. These are normal news articles from newspapers (not opinion pieces),
so we re-classify each into its correct topical category. Genuine op-eds go to
'Opinion'. 'Editorial' is then reserved for hand-published editorials.

Usage:
    source venv/bin/activate
    python scripts/recategorize_editorials.py            # dry run (prints proposed changes)
    python scripts/recategorize_editorials.py --apply    # writes changes to the DB
    python scripts/recategorize_editorials.py --limit 15 # only first N (for sampling)

Requires SUPABASE_URL, SUPABASE_SERVICE_KEY, LLM_API_KEY in .env.
"""
import os
import sys
import json
import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

MODEL = "gpt-4.1-mini"
BATCH = 30
ALLOWED = [
    "Politics", "Business", "International", "Local", "Crime", "Health",
    "Science", "Technology", "Environment", "Entertainment", "Sports",
    "Opinion", "Education", "Culture", "General",
]

SYSTEM = (
    "You re-categorize news articles that were previously MIS-tagged as 'Editorial'. "
    "Most are ordinary news; a few are genuine opinion/op-ed pieces. "
    "For each article, choose the single best category from this exact list: "
    + ", ".join(ALLOWED) + ". "
    "Use 'Opinion' ONLY when the article is genuinely an opinion column, editorial, "
    "or personal-viewpoint essay (it argues a position). Otherwise pick the correct "
    "topical category. If unsure, use 'General'. "
    "Respond with JSON: {\"results\": [{\"id\": <int>, \"category\": \"<one of the list>\"}]}."
)


def classify(batch, api_key):
    items = [{"id": a["id"], "title": a["title"], "summary": (a.get("summary") or "")[:300]} for a in batch]
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(items)},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = json.loads(resp.json()["choices"][0]["message"]["content"])
    out = {}
    for r in data.get("results", []):
        cat = r.get("category")
        if cat in ALLOWED:
            out[int(r["id"])] = cat
    return out


def main():
    apply = "--apply" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    api_key = os.environ["LLM_API_KEY"]

    rows = sb.table("articles").select("id,title,summary").eq("category", "Editorial").execute().data
    if limit:
        rows = rows[:limit]
    print(f"Found {len(rows)} 'Editorial' articles to re-classify\n")

    mapping = {}
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        mapping.update(classify(chunk, api_key))
        print(f"  classified {min(i+BATCH, len(rows))}/{len(rows)}")

    # Report
    from collections import Counter
    counts = Counter(mapping.values())
    print("\nProposed category distribution:")
    for cat, n in counts.most_common():
        print(f"  {cat:15} {n}")

    print("\nSamples:")
    by_id = {a["id"]: a for a in rows}
    for aid, cat in list(mapping.items())[:15]:
        print(f"  [{cat:13}] {by_id[aid]['title'][:60]}")

    if not apply:
        print(f"\nDRY RUN — no changes written. Re-run with --apply to update {len(mapping)} articles.")
        return

    updated = 0
    for aid, cat in mapping.items():
        sb.table("articles").update({"category": cat}).eq("id", aid).execute()
        updated += 1
    print(f"\nApplied: {updated} articles re-categorized out of 'Editorial'.")


if __name__ == "__main__":
    main()
