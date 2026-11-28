"""Restablece la contraseña de cualquier usuario (administrador o vendedor) desde la computadora del negocio.

Sirve cuando se olvida la contraseña, incluso la del administrador: no pide la anterior, desbloquea al usuario
y lo vuelve a activar si estaba desactivado.

    restablecer_contrasena.bat                       (muestra los usuarios y pregunta)
    python -m scripts.restablecer_contrasena <usuario> <nueva_contraseña>
"""
from __future__ import annotations

import getpass
import sys

from werkzeug.security import generate_password_hash

MIN_PASSWORD = 6
ROLE = {"admin": "Administrador", "seller": "Vendedor"}


def list_users(app) -> list[tuple[str, str, str, bool]]:
    from server.db import session
    from server.models import User

    with app.app_context():
        return [(u.username, u.full_name or "", ROLE.get(u.role, u.role), u.active)
                for u in session.query(User).order_by(User.role, User.username)]


def run(app, username: str, new_password: str) -> bool:
    from server.db import session
    from server.models import LoginFailure, User

    with app.app_context():
        u = session.query(User).filter_by(username=username.strip().lower()).one_or_none()
        if not u:
            return False
        u.password_hash = generate_password_hash(new_password)
        u.active = True
        session.query(LoginFailure).filter_by(username=u.username).delete()
        session.commit()
        return True


def interactive(app, ask=input, ask_secret=getpass.getpass, say=print) -> bool:
    users = list_users(app)
    say("\n  Usuarios del sistema:\n")
    for username, name, role, active in users:
        say(f"    {username:<20} {role:<14} {name}{'' if active else '  (desactivado)'}")
    say("")
    names = {u[0] for u in users}
    username = ask("  Usuario al que le cambias la contraseña: ").strip().lower()
    if username not in names:
        say("\n  [!] Ese usuario no existe. Escríbelo como aparece en la lista.")
        return False
    while True:
        pw = ask_secret(f"  Nueva contraseña ({MIN_PASSWORD} o más caracteres, no se ve al escribir): ")
        if len(pw) < MIN_PASSWORD:
            say(f"  [!] Debe tener al menos {MIN_PASSWORD} caracteres.")
            continue
        if pw != ask_secret("  Escríbela otra vez: "):
            say("  [!] No coinciden. Intenta de nuevo.")
            continue
        break
    run(app, username, pw)
    say(f"\n  Listo: la contraseña de «{username}» se cambió. Ya puede entrar con la nueva"
        " (también quedó desbloqueado y activo).")
    if pw in ("admin123", "12345"):
        say("  Aviso: con esa contraseña inicial no se puede entrar por internet.")
    return True


if __name__ == "__main__":  # pragma: no cover
    from server import create_app

    app = create_app()
    if len(sys.argv) == 1:
        sys.exit(0 if interactive(app) else 1)
    if len(sys.argv) != 3 or len(sys.argv[2]) < MIN_PASSWORD:
        print("Uso: restablecer_contrasena.bat   o   python -m scripts.restablecer_contrasena <usuario> <contraseña de 6 o más>")
        sys.exit(1)
    print("Contraseña actualizada." if run(app, sys.argv[1], sys.argv[2]) else "Ese usuario no existe.")
