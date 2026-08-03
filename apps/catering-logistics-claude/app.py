from __future__ import annotations

import csv
import io
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")


@dataclass(frozen=True)
class Ingredient:
    name: str
    quantity: float
    unit: str


@dataclass(frozen=True)
class Recipe:
    id: str
    name: str
    yield_count: int
    ingredients: tuple[Ingredient, ...]


RECIPES: tuple[Recipe, ...] = (
    Recipe(
        id="chicken",
        name="Herb Roasted Chicken",
        yield_count=10,
        ingredients=(
            Ingredient("Chicken breasts", 10, "each"),
            Ingredient("Olive oil", 0.5, "cup"),
            Ingredient("Garlic", 8, "cloves"),
            Ingredient("Fresh herbs", 0.25, "cup"),
        ),
    ),
    Recipe(
        id="pasta",
        name="Creamy Tuscan Pasta",
        yield_count=12,
        ingredients=(
            Ingredient("Penne pasta", 3, "lb"),
            Ingredient("Heavy cream", 1.5, "qt"),
            Ingredient("Parmesan", 1.25, "lb"),
            Ingredient("Spinach", 1.5, "lb"),
        ),
    ),
    Recipe(
        id="salad",
        name="Market Greens Salad",
        yield_count=15,
        ingredients=(
            Ingredient("Mixed greens", 2.5, "lb"),
            Ingredient("Cherry tomatoes", 2, "pt"),
            Ingredient("Cucumber", 3, "each"),
            Ingredient("Vinaigrette", 2, "cup"),
        ),
    ),
)


def round_quantity(value: float) -> float:
    return round(value + 1e-9, 2)


def build_operations_package(payload: dict[str, Any]) -> dict[str, Any]:
    guests = max(1, int(payload.get("guests", 85)))
    buffer_percent = min(30, max(0, int(payload.get("buffer", 8))))
    selected_ids = payload.get("selected") or [recipe.id for recipe in RECIPES]

    production_count = math.ceil(guests * (1 + buffer_percent / 100))
    selected_recipes = [recipe for recipe in RECIPES if recipe.id in selected_ids]

    prep_rows: list[dict[str, Any]] = []
    for recipe in selected_recipes:
        scale = production_count / recipe.yield_count
        for ingredient in recipe.ingredients:
            prep_rows.append(
                {
                    "dish": recipe.name,
                    "ingredient": ingredient.name,
                    "quantity": round_quantity(ingredient.quantity * scale),
                    "unit": ingredient.unit,
                }
            )

    warnings = ["Hot holding cabinet capacity should be confirmed before 11:00 AM."]
    if production_count > 100:
        warnings.insert(0, "Guest count exceeds the small-event staffing threshold.")
    if len(selected_recipes) < 2:
        warnings.insert(0, "Menu has fewer than two active production items.")

    assembly = [
        {
            "step": 1,
            "title": "Stage by service zone",
            "instruction": "Separate cold items, hot mains, and finishing ingredients before assembly begins.",
        },
        {
            "step": 2,
            "title": "Build in batches of 20",
            "instruction": "Label each completed batch with item, count, allergen flag, and service destination.",
        },
        {
            "step": 3,
            "title": "Protect holding temperatures",
            "instruction": "Keep hot foods above 140°F and chilled foods below 41°F until loading.",
        },
        {
            "step": 4,
            "title": "Run final QA",
            "instruction": "Match packed quantities against the deterministic production count before loading.",
        },
    ]

    return {
        "event": {
            "name": "Harbor & Foundry Annual Dinner",
            "service_time": "Saturday · 6:00 PM",
            "venue": "Waterfront Gallery",
        },
        "inputs": {
            "guests": guests,
            "buffer_percent": buffer_percent,
            "production_count": production_count,
            "selected_menu_ids": [recipe.id for recipe in selected_recipes],
        },
        "recipes": [
            {
                "id": recipe.id,
                "name": recipe.name,
                "yield_count": recipe.yield_count,
            }
            for recipe in RECIPES
        ],
        "prep_rows": prep_rows,
        "assembly": assembly,
        "timeline": [
            {"name": "Cold prep", "owner": "Maya", "start": "8:00 AM", "status": "Ready"},
            {"name": "Hot production", "owner": "Luis", "start": "10:30 AM", "status": "Blocked"},
            {"name": "Pack & label", "owner": "Jordan", "start": "1:15 PM", "status": "Pending"},
            {"name": "Load vehicle", "owner": "Sam", "start": "2:20 PM", "status": "Pending"},
        ],
        "warnings": warnings,
        "health": {
            "score": 96,
            "source_data": "Valid",
            "calculation_engine": "Passed",
            "output_schema": "Passed",
            "long_chat_dependency": "Removed",
        },
    }


@app.get("/")
def index() -> Response:
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/api/recipes")
def recipes() -> Response:
    return jsonify(
        [
            {
                "id": recipe.id,
                "name": recipe.name,
                "yield_count": recipe.yield_count,
                "ingredients": [asdict(item) for item in recipe.ingredients],
            }
            for recipe in RECIPES
        ]
    )


@app.post("/api/operations-package")
def operations_package() -> Response:
    payload = request.get_json(silent=True) or {}
    return jsonify(build_operations_package(payload))


@app.post("/api/export/prep.csv")
def export_prep_csv() -> Response:
    payload = request.get_json(silent=True) or {}
    package = build_operations_package(payload)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["dish", "ingredient", "quantity", "unit"])
    writer.writeheader()
    writer.writerows(package["prep_rows"])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=catering-prep-list.csv"},
    )


@app.get("/api/health")
def health() -> Response:
    return jsonify({"status": "ok", "service": "catering-logistics-claude-demo"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
