import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CameraCapture } from "./CameraCapture";

it("si se sale mientras se abre la cámara, la apaga cuando llega", async () => {
  const stop = vi.fn();
  let resolve!: (s: MediaStream) => void;
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)) },
    configurable: true,
  });
  const { unmount } = render(<CameraCapture count={0} onPhotos={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Usar cámara/ }));
  unmount();
  await act(async () => resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  expect(stop).toHaveBeenCalled();
});
