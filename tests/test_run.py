import ipaddress
import socket


def test_local_ip_format():
    import run

    ipaddress.ip_address(run.local_ip())


def test_port_in_use_detects_open_socket():
    import run

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    s.listen()
    port = s.getsockname()[1]
    try:
        assert run.port_in_use(port) is True
    finally:
        s.close()


def test_port_free():
    import run

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    assert run.port_in_use(port) is False


def test_configurar_creates_env_once(tmp_path, repo_root):
    from scripts.configurar import run

    (tmp_path / ".env.example").write_text((repo_root / ".env.example").read_text(encoding="utf-8"), encoding="utf-8")
    assert run(tmp_path) is True
    first = (tmp_path / ".env").read_text(encoding="utf-8")
    assert "SECRET_KEY=" in first and len(first.split("SECRET_KEY=")[1].split()[0]) == 64
    assert run(tmp_path) is False
    assert (tmp_path / ".env").read_text(encoding="utf-8") == first
