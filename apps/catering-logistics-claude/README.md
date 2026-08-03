# Catering Logistics Claude Demo

Python-first modernization demo for a catering company that relies on Google Workspace, Google Sheets, JSON, Markdown, and Claude.

## Core design

The demo treats each source according to what it is best at:

- **Google Sheets**: recipes, yields, ingredient quantities, and operational tables
- **JSON**: event configuration, guest count, venue, service style, and selected menu
- **Markdown**: approved assembly SOPs, safety rules, and reusable staff instructions
- **Python**: normalization, recipe scaling, validation, warnings, exports, and workflow state
- **Claude**: bounded language generation after source data has been validated

This removes the need for a long-running Claude conversation to act as the database, calculator, and workflow engine.

## Demo data

The repository includes credential-free sample sources:

- `data/recipes.csv` simulates a Google Sheets export
- `data/event.json` stores event configuration
- `data/assembly_sop.md` stores approved operating procedures

`workspace_sources.py` normalizes all three formats behind one repository interface. In production, the CSV loader can be replaced by a Google Sheets API adapter without changing the calculation or UI layers.

## Run locally

```bash
cd apps/catering-logistics-claude
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:3000`.

## Key endpoints

- `GET /api/workspace-sources`
- `GET /api/recipes`
- `POST /api/operations-package`
- `POST /api/export/prep.csv`
- `GET /api/health`

## Production next steps

1. Replace the CSV adapter with Google Sheets API access using a service account or OAuth.
2. Read event JSON and SOP Markdown from a designated Google Drive folder.
3. Add revision IDs, source timestamps, and conflict detection.
4. Add Claude structured output for exception handling and staff-facing wording only.
5. Write generated prep packages back to Google Docs or Sheets.
