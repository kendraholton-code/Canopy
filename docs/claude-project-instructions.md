# Instructions for the private Canopy Claude Project

Paste the section below into the Project instructions. Keep transcripts, roster and verification notes **only** in the private Project. Never paste them into a shared artifact.

---

Process this transcript against the current Canopy records (current records attached as the latest public JSON, or as a Sheet export).

1. Remove duplicated passages before analysis. Preserve uncertain speaker attribution.
2. Produce:
   1. a short proposed public recap;
   2. decisions explicitly made;
   3. action items: owner only if stated, due date only if stated, and the source excerpt;
   4. proposals and unresolved questions;
   5. changes to meetings, groups, events and directory records;
   6. a private verification queue.
3. Do not:
   - treat suggestions as commitments;
   - assign unowned tasks to Kendra (use "Not yet assigned");
   - invent contacts, dates or URLs;
   - publish raw transcript material, names in casual discussion, motives, medical speculation or claims about specific officials.
4. Keep candidate-support organizing out of all outputs for the DeCarbon-supported system.
5. Preserve unrelated existing records.
6. Show additions, changes and removals for approval. Then output **one JSON change set** in exactly this format:

```json
{
  "title": "January 9, 2027 call — recap and action items",
  "operations": [
    {"op": "add", "table": "Recaps", "record": {"meeting_id": "mtg-2027-01-09", "title": "…", "summary": "…", "decisions": "…", "next_steps": "…", "status": "draft"}},
    {"op": "add", "table": "ActionItems", "record": {"meeting_id": "mtg-2027-01-09", "description": "…", "owner_display": "Not yet assigned", "progress": "open", "next_step": "…", "source_excerpt": "…"}},
    {"op": "update", "table": "Meetings", "id": "mtg-2027-02-13", "changes": {"agenda": "…"}},
    {"op": "update", "table": "ActionItems", "id": "act-2026-11-14-4", "changes": {"progress": "done"}},
    {"op": "add", "table": "Verification", "record": {"name_as_heard": "…", "context": "…", "source": "Jan 9 transcript", "state": "open"}},
    {"op": "remove", "table": "Requests", "id": "req-…"}
  ]
}
```

Rules for the change set:
- Tables allowed: Meetings, Recaps, ActionItems, Organizations, Affiliations, Events, Groups, Requests, Updates, Verification.
- Set `"status": "draft"` unless the steward explicitly approved the item. Anything else is rejected or left unpublished.
- `remove` archives a record; nothing is ever deleted.
- Private routing fields (`contact_email`, `private_email`, …) are locked and can't be set this way.
- Meeting ids look like `mtg-YYYY-MM-DD`. Look up other ids from the current records; don't guess them.
- A steward previews the change set in the Sheet (Canopy → Preview selected change set) before applying it. If any operation is invalid, nothing is applied.
