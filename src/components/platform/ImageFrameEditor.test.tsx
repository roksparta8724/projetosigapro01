import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageFrameEditor } from "@/components/platform/ImageFrameEditor";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("ImageFrameEditor image ratio", () => {
  const OriginalImage = window.Image;
  const OriginalResizeObserver = window.ResizeObserver;

  beforeEach(() => {
    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    window.Image = OriginalImage;
    window.ResizeObserver = OriginalResizeObserver;
    vi.restoreAllMocks();
  });

  it("does not render the photo using fake square dimensions before natural size is known", async () => {
    let pendingImage: { onload: null | (() => void); naturalWidth: number; naturalHeight: number; src: string } | null = null;

    class ImageMock {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 800;
      naturalHeight = 1200;
      private _src = "";
      constructor() {
        pendingImage = this;
      }
      set src(value: string) {
        this._src = value;
      }
      get src() {
        return this._src;
      }
    }

    window.Image = ImageMock as unknown as typeof Image;

    render(
      <ImageFrameEditor
        imageUrl="https://example.test/avatar.jpg"
        scale={1}
        offsetX={0}
        offsetY={0}
        onChange={vi.fn()}
        fitMode="contain"
        minScale={1}
        shape="circle"
        viewportClassName="h-[320px] w-[320px]"
      />,
    );

    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();

    await act(async () => {
      pendingImage?.onload?.();
    });

    expect(screen.getByAltText("Preview")).toBeInTheDocument();
  });
});
