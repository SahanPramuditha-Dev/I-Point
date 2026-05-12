def test_app_startup_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_pos_checkout_and_return_stock_consistency(client, auth_headers):
    inv_resp = client.get("/inventory", headers=auth_headers)
    assert inv_resp.status_code == 200, inv_resp.text
    inventory = inv_resp.json()
    item = next(i for i in inventory if i["quantity"] >= 2)
    item_id = item["id"]
    original_qty = item["quantity"]
    unit_price = float(item["sale_price"])

    checkout_payload = {
        "customer_id": None,
        "payment_method": "Cash",
        "paid": True,
        "discount_amount": 0,
        "tax_amount": 0,
        "lines": [
            {
                "item_id": item_id,
                "quantity": 2,
                "price": unit_price,
                "warranty_days": 0,
            }
        ],
    }
    checkout_resp = client.post("/pos/checkout", json=checkout_payload, headers=auth_headers)
    assert checkout_resp.status_code == 200, checkout_resp.text
    sale = checkout_resp.json()
    assert sale["total"] == unit_price * 2
    sale_id = sale["sale_id"]

    inv_after_sale = client.get("/inventory", headers=auth_headers).json()
    sold_item = next(i for i in inv_after_sale if i["id"] == item_id)
    assert sold_item["quantity"] == original_qty - 2

    return_payload = {
        "sale_id": sale_id,
        "note": "test return",
        "lines": [{"item_id": item_id, "quantity": 2, "price": unit_price, "warranty_days": 0}],
    }
    return_resp = client.post("/pos/return", json=return_payload, headers=auth_headers)
    assert return_resp.status_code == 200, return_resp.text

    inv_after_return = client.get("/inventory", headers=auth_headers).json()
    returned_item = next(i for i in inv_after_return if i["id"] == item_id)
    assert returned_item["quantity"] == original_qty

    movement_resp = client.get("/inventory/movements", headers=auth_headers)
    assert movement_resp.status_code == 200
    movements = movement_resp.json()
    sale_movements = [m for m in movements if m["reference_type"] == "sale" and m["reference_id"] == sale_id and m["item_id"] == item_id]
    assert any(m["movement_type"] == "SALE" and m["quantity"] == -2 for m in sale_movements)

    return_sale_id = return_resp.json()["return_sale_id"]
    return_movements = [m for m in movements if m["reference_type"] == "sale_return" and m["reference_id"] == return_sale_id and m["item_id"] == item_id]
    assert any(m["movement_type"] == "RETURN" and m["quantity"] == 2 for m in return_movements)
