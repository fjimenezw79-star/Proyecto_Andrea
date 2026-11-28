"""Usuarios: alta de vendedores, restablecer contraseñas, desactivar y nunca quedarse sin administrador."""
import pytest

from tests.conftest import login


def new_user(admin, username="maria", role="seller", password="maria2026", full_name="María López"):
    return admin.post("/api/users", json={"username": username, "full_name": full_name, "role": role, "password": password})


def test_admin_creates_seller_who_can_log_in(app, admin):
    r = new_user(admin, username="  Maria ")
    assert r.status_code == 201, r.get_json()
    u = r.get_json()["user"]
    assert (u["username"], u["role"], u["active"], u["name"]) == ("maria", "seller", True, "María López")
    c = login(app.test_client(), "maria", "maria2026")
    assert c.get("/api/auth/me").get_json()["user"]["role"] == "seller"
    names = [x["username"] for x in admin.get("/api/users").get_json()["users"]]
    assert {"admin", "vendedor", "maria"} <= set(names)


@pytest.mark.parametrize("body,field", [
    ({"username": "ma", "full_name": "X", "password": "secreta1"}, "username"),
    ({"username": "con espacio", "full_name": "X", "password": "secreta1"}, "username"),
    ({"username": "pedro", "full_name": "", "password": "secreta1"}, "full_name"),
    ({"username": "pedro", "full_name": "Pedro", "password": "123"}, "password"),
    ({"username": "pedro", "full_name": "Pedro", "password": "12345"}, "password"),
    ({"username": "pedro", "full_name": "Pedro", "password": "secreta1", "role": "jefe"}, "role"),
], ids=["usuario-corto", "usuario-con-espacio", "sin-nombre", "contrasena-corta", "contrasena-inicial", "rol-invalido"])
def test_create_validation(admin, body, field):
    r = admin.post("/api/users", json=body)
    assert r.status_code == 400 and r.get_json()["field"] == field


def test_duplicate_username(admin):
    new_user(admin)
    r = new_user(admin, username="MARIA")
    assert r.status_code == 409


def test_users_api_is_admin_only(seller, client):
    assert seller.get("/api/users").status_code == 403
    assert seller.post("/api/users", json={}).status_code == 403
    assert client.get("/api/users").status_code == 401


def test_admin_resets_any_password_and_unlocks(app, admin):
    vid = next(u["id"] for u in admin.get("/api/users").get_json()["users"] if u["username"] == "vendedor")
    c = app.test_client()
    for _ in range(5):  # el vendedor olvidó su contraseña y quedó bloqueado
        c.post("/api/auth/login", json={"username": "vendedor", "password": "mal"})
    assert c.post("/api/auth/login", json={"username": "vendedor", "password": "12345"}).status_code == 429
    r = admin.post(f"/api/users/{vid}/password", json={"password": "nueva2026"})
    assert r.status_code == 200, r.get_json()
    login(app.test_client(), "vendedor", "nueva2026")
    assert app.test_client().post("/api/auth/login", json={"username": "vendedor", "password": "12345"}).status_code == 401
    assert admin.post(f"/api/users/{vid}/password", json={"password": "12345"}).status_code == 400


def test_admin_can_reset_own_password(app, admin):
    me = next(u for u in admin.get("/api/users").get_json()["users"] if u["is_me"])
    assert admin.post(f"/api/users/{me['id']}/password", json={"password": "jefa2026!"}).status_code == 200
    login(app.test_client(), "admin", "jefa2026!")


def test_deactivate_keeps_history_and_blocks_login(app, admin):
    uid = new_user(admin).get_json()["user"]["id"]
    c = login(app.test_client(), "maria", "maria2026")
    r = admin.patch(f"/api/users/{uid}", json={"active": False})
    assert r.status_code == 200 and r.get_json()["user"]["active"] is False
    assert c.get("/api/auth/me").status_code == 401  # su sesión abierta deja de valer
    assert app.test_client().post("/api/auth/login", json={"username": "maria", "password": "maria2026"}).status_code == 401
    admin.patch(f"/api/users/{uid}", json={"active": True})
    login(app.test_client(), "maria", "maria2026")


def test_never_without_an_active_admin(admin):
    users = admin.get("/api/users").get_json()["users"]
    me = next(u for u in users if u["is_me"])
    assert admin.patch(f"/api/users/{me['id']}", json={"active": False}).get_json()["message"] == "No puedes desactivar tu propio usuario."
    assert admin.patch(f"/api/users/{me['id']}", json={"role": "seller"}).status_code == 400
    # con otro administrador, ya se puede cambiar el rol
    new_user(admin, username="jefa", role="admin")
    assert admin.patch(f"/api/users/{me['id']}", json={"role": "seller", "full_name": "Dueña"}).status_code == 200


def test_rename_and_change_role(app, admin):
    uid = new_user(admin).get_json()["user"]["id"]
    r = admin.patch(f"/api/users/{uid}", json={"full_name": "María L.", "role": "admin"})
    assert r.get_json()["user"]["role"] == "admin" and r.get_json()["user"]["name"] == "María L."
    c = login(app.test_client(), "maria", "maria2026")
    assert c.get("/api/users").status_code == 200


def test_user_changes_go_to_audit_log(admin):
    new_user(admin)
    log = admin.get("/api/audit").get_json()
    entries = log.get("entries") or log.get("items") or log.get("log") or []
    assert any(e["action"] == "Dio de alta usuario" for e in entries)


def test_reset_script_works_for_admin_and_sellers(app, admin):
    """restablecer_contrasena.bat: lista a todos, cambia la contraseña (oculta y confirmada) y desbloquea."""
    from scripts import restablecer_contrasena as rc

    new_user(admin)
    uid = next(u["id"] for u in admin.get("/api/users").get_json()["users"] if u["username"] == "maria")
    admin.patch(f"/api/users/{uid}", json={"active": False})
    users = {u[0]: u for u in rc.list_users(app)}
    assert users["admin"][2] == "Administrador" and users["vendedor"][2] == "Vendedor" and users["maria"][3] is False

    said = []
    secrets = iter(["corta", "otra1234", "distinta", "otra1234", "otra1234"])
    ok = rc.interactive(app, ask=lambda _: "Maria", ask_secret=lambda _: next(secrets), say=said.append)
    assert ok is True
    assert any("Debe tener al menos 6" in s for s in said) and any("No coinciden" in s for s in said)
    login(app.test_client(), "maria", "otra1234")  # quedó reactivada con la nueva contraseña

    assert rc.interactive(app, ask=lambda _: "nadie", ask_secret=lambda _: "x", say=said.append) is False
    assert rc.run(app, "admin", "admin2026") is True
    login(app.test_client(), "admin", "admin2026")
