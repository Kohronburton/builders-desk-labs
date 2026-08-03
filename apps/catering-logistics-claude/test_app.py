from app import app, build_operations_package


def test_production_count_and_scaling():
    package = build_operations_package({"guests": 100, "buffer": 10, "selected": ["chicken"]})
    assert package["inputs"]["production_count"] == 111
    chicken = next(row for row in package["prep_rows"] if row["ingredient"] == "Chicken breasts")
    assert chicken["quantity"] == 111


def test_menu_warning_when_one_item_selected():
    package = build_operations_package({"guests": 50, "buffer": 0, "selected": ["salad"]})
    assert "Menu has fewer than two active production items." in package["warnings"]


def test_health_endpoint():
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"
