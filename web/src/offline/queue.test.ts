import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, AuthError } from "../lib/api";
import { _reset, BACKOFF_MS, discard, enqueue, flush, pending, retry, type QueueItem } from "./queue";

const item = (uid: string, user = 1, kind: QueueItem["kind"] = "sale") => ({ uid, user, kind, label: `Venta ${uid}`, path: "/api/sales", json: { id: uid }, clientTime: "2026-11-28T10:00:00" });

beforeEach(async () => {
  await _reset();
  globalThis.indexedDB = new IDBFactory();
});

describe("cola sin señal", () => {
  it("queue keeps order and per-user isolation", async () => {
    await enqueue(item("aaaaaaaa1"));
    await enqueue(item("bbbbbbbb2", 2));
    await enqueue(item("cccccccc3"));
    await enqueue(item("aaaaaaaa1")); // la misma acción no se duplica
    expect((await pending(1)).map((i) => i.uid)).toEqual(["aaaaaaaa1", "cccccccc3"]);
    expect((await pending(2)).map((i) => i.uid)).toEqual(["bbbbbbbb2"]);
    const sent: string[] = [];
    const r = await flush(1, async (i) => void sent.push(i.uid));
    expect(sent).toEqual(["aaaaaaaa1", "cccccccc3"]);
    expect(r).toMatchObject({ sent: 2, remaining: 0 });
    expect(await pending(2)).toHaveLength(1);
  });

  it("flush deletes only on 2xx", async () => {
    await enqueue(item("aaaaaaaa1"));
    await enqueue(item("bbbbbbbb2"));
    const r = await flush(1, async () => {
      throw new AuthError(401, "Inicia sesión");
    });
    expect(r).toMatchObject({ sent: 0, remaining: 2, stopped: "auth" });
    expect(await pending(1)).toHaveLength(2);
  });

  it("4xx marks problem and keeps going", async () => {
    await enqueue(item("aaaaaaaa1"));
    await enqueue(item("bbbbbbbb2"));
    const r = await flush(1, async (i) => {
      if (i.uid === "aaaaaaaa1") throw new ApiError(400, "El cliente no existe.");
    });
    expect(r).toMatchObject({ sent: 1, problems: 1, remaining: 1 });
    const [p] = await pending(1);
    expect(p).toMatchObject({ status: "problem", message: "El cliente no existe." });
    await flush(1, async () => undefined); // los problemas no se reenvían solos
    expect(await pending(1)).toHaveLength(1);
    await retry("aaaaaaaa1");
    await flush(1, async () => undefined);
    expect(await pending(1)).toHaveLength(0);
  });

  it("network error backs off", async () => {
    await enqueue(item("aaaaaaaa1"));
    await enqueue(item("bbbbbbbb2"));
    let calls = 0;
    const down = async () => {
      calls++;
      throw new ApiError(0, "Sin red");
    };
    const t0 = 1_000_000;
    expect(await flush(1, down, t0)).toMatchObject({ sent: 0, remaining: 2, stopped: "network" });
    expect(calls).toBe(1); // no intenta la siguiente para no alterar el orden
    expect((await pending(1))[0].nextAt).toBe(t0 + BACKOFF_MS[0]);
    await flush(1, down, t0 + 1000);
    expect(calls).toBe(1); // todavía en espera
    await flush(1, down, t0 + BACKOFF_MS[0]);
    expect((await pending(1))[0].nextAt).toBe(t0 + BACKOFF_MS[0] + BACKOFF_MS[1]);
    await flush(1, async () => undefined, t0 + 10 * 60_000);
    expect(await pending(1)).toHaveLength(0);
  });

  it("409 procesando reintenta después y descartar quita la acción", async () => {
    await enqueue(item("aaaaaaaa1"));
    const r = await flush(1, async () => {
      throw new ApiError(409, "Esta acción se está procesando; se reintentará.");
    }, 0);
    expect(r.stopped).toBe("busy");
    expect((await pending(1))[0].status).toBe("pending");
    await discard("aaaaaaaa1", "Se cobró dos veces");
    expect(await pending(1)).toHaveLength(0);
  });
});
