"""Cambia la contraseña de un usuario desde la consola.

    python -m scripts.restablecer_contrasena <usuario> <nueva_contraseña>
"""
from __future__ import annotations

import sys

from werkzeug.security import generate_password_hash


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


if __name__ == "__main__":  # pragma: no cover
    if len(sys.argv) != 3 or len(sys.argv[2]) < 6:
        print("Uso: restablecer_contrasena.bat <usuario> <nueva contraseña de 6 o más caracteres>")
        sys.exit(1)
    from server import create_app

    print("Contraseña actualizada." if run(create_app(), sys.argv[1], sys.argv[2]) else "Ese usuario no existe.")
