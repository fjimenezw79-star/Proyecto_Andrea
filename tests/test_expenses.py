def add(c, **kw):
    body = {"description": "Recibo de luz", "category": "Luz e internet", "amount_cents": 45000, "from_register": False}
    body.update(kw)
    return c.post("/api/expenses", json=body)


def test_create_list_expense(admin):
    r = add(admin)
    assert r.status_code == 201
    lst = admin.get("/api/expenses").get_json()["expenses"]
    assert lst[0]["description"] == "Recibo de luz" and lst[0]["amount_cents"] == 45000


def test_amount_must_be_positive(admin):
    assert add(admin, amount_cents=0).status_code == 400


def test_bad_category(admin):
    r = add(admin, category="Fiesta")
    assert r.status_code == 400 and r.get_json()["field"] == "category"


def test_seller_forbidden(seller):
    assert add(seller).status_code == 403
    assert seller.get("/api/expenses").status_code == 403


def test_edit_and_delete(admin):
    eid = add(admin).get_json()["expense"]["id"]
    admin.patch(f"/api/expenses/{eid}", json={"amount_cents": 50000})
    assert admin.get("/api/expenses").get_json()["expenses"][0]["amount_cents"] == 50000
    assert admin.delete(f"/api/expenses/{eid}").status_code == 200
    assert admin.get("/api/expenses").get_json()["expenses"] == []


def test_cannot_delete_from_closed_session(admin):
    eid = add(admin, from_register=True, amount_cents=5000).get_json()["expense"]["id"]
    admin.post("/api/cash/close", json={"counted_cents": 0})
    assert admin.delete(f"/api/expenses/{eid}").status_code == 409
