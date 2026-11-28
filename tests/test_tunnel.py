from pathlib import Path

from server.tunnel import Tunnel


def test_tunnel_handle_line_extracts_quick_url():
    t = Tunnel(Path("cloudflared"), 5000)
    assert t.mode == "prueba" and t.url is None
    assert "--url" in t.command() and "http://127.0.0.1:5000" in t.command()
    t.handle_line("INF Requesting new quick Tunnel on https://api.trycloudflare.com...")
    assert t.url is None
    t.handle_line("INF |  https://dulce-mochila-azul.trycloudflare.com  |")
    assert t.url == "https://dulce-mochila-azul.trycloudflare.com"
    assert not t.connected.is_set()
    t.handle_line("INF Registered tunnel connection connIndex=0")
    assert t.connected.is_set()


def test_tunnel_with_token_keeps_fixed_url():
    t = Tunnel(Path("cloudflared"), 5000, token="abc", fixed_url="https://tienda.example.com/")
    assert t.mode == "permanente" and t.url == "https://tienda.example.com"
    assert t.command()[-2:] == ["--token", "abc"]
    t.handle_line("INF https://otra.trycloudflare.com")
    assert t.url == "https://tienda.example.com"
