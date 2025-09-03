// mostly from myriad-dreamin/tinymist/tools/typst-preview-frontend/ws.ts

import { PreviewMode } from "../typst-dom/typst-doc.mjs";
import {
  TypstPreviewDocument as TypstDocument,
  TypstPreviewDocument,
} from "../typst-dom/index.preview.mjs";
import {
  createTypstRenderer,
  rendererBuildInfo,
  RenderSession,
} from "@myriaddreamin/typst.ts/dist/esm/renderer.mjs";
import {
  Subject,
  Subscription,
  buffer,
  debounceTime,
  fromEvent,
  tap,
} from "rxjs";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageclient/browser";

// @ts-ignore
import renderModule from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";

import { Buffer } from "buffer";

const NOT_AVAILABLE = "current not available";
const enc = new TextEncoder();
const dec = new TextDecoder();
const COMMA = enc.encode(",");

import { triggerRipple } from "../typst-dom/typst-animation.mts";
import {
  createResizeObservable,
  getRelatedElements,
  ignoredEvent,
  INVERT_COLORS_STRATEGY,
  isTypstPreviewPageInner,
  sendWebSocketMessage,
  isTypstPreviewMessage,
} from "./utils.mts";
import { Ref } from "vue";
import {
  StrategyKey,
  StrategyMap,
  TypstPosition,
  TypstPreviewDocumentRootElement,
  TypstPreviewHookedElement,
  TypstPreviewPageInner,
  TypstPreviewWindowElement,
} from "./types";

export function usePreviewComponent(
  reader: BrowserMessageReader,
  writer: BrowserMessageWriter,
  hookedElem: Ref<TypstPreviewHookedElement>,
  windowElem: Ref<TypstPreviewWindowElement>,
  outerElem: Ref<HTMLElement>
) {
  let svgDoc: TypstPreviewDocument | null = null;
  let rootElem: TypstPreviewDocumentRootElement | null = null;

  const subsribes: Subscription[] = [];

  let _disposed = false;

  function createSvgDocument(kModule: RenderSession) {
    if (hookedElem.value.firstElementChild?.tagName !== "svg") {
      hookedElem.value.innerHTML = "";
    }

    windowElem.value.initTypstSvg = initTypstSvg;
    windowElem.value.typstWebsocket = {
      send: (data: string | ArrayBuffer) => sendWebSocketMessage(writer, data),
    };

    const resizeTarget = outerElem.value;

    svgDoc = new TypstDocument({
      windowElem: windowElem.value,
      hookedElem: hookedElem.value,
      kModule,
      previewMode: PreviewMode.Doc,
      // set rescale target to `body`
      retrieveDOMState() {
        return {
          // reserving 1px to hide width border
          width: resizeTarget.clientWidth + 1,
          // reserving 1px to hide width border
          height: resizeTarget.offsetHeight,
          boundingRect: resizeTarget.getBoundingClientRect(),
        };
      },
    });

    // drag (panal resizing) -> rescaling
    subsribes.push(
      createResizeObservable(windowElem.value).subscribe(() => {
        svgDoc?.addViewportChange();
      })
    );

    subsribes.push(
      fromEvent(windowElem.value, "scroll")
        .pipe(debounceTime(500))
        .subscribe(() => {
          svgDoc?.addViewportChange();
        })
    );

    // Handle messages sent from the extension to the webview
    subsribes.push(
      fromEvent<MessageEvent>(windowElem.value, "message").subscribe(
        (event) => {
          const message = event.data; // The json data that the extension sent
          switch (message.type) {
            case "outline": {
              svgDoc!.setOutineData(message.outline);
              break;
            }
          }
        }
      )
    );
    return svgDoc;
  }

  function processMessage(data: ArrayBuffer) {
    if (!(data instanceof ArrayBuffer)) {
      if (data === NOT_AVAILABLE) {
        return;
      }
      console.error("WebSocket data is not a ArrayBuffer", data);
      return;
    }

    const buffer = data;
    const messageData = new Uint8Array(buffer);

    const message_idx = messageData.indexOf(COMMA[0]);
    const message = [
      dec.decode(messageData.slice(0, message_idx).buffer),
      messageData.slice(message_idx + 1),
    ];

    console.debug("recv", message[0], messageData.length);

    if (message[0] === "jump" || message[0] === "viewport") {
      // todo: aware height padding
      let currentPageNumber = 1;

      currentPageNumber = currentPosition()?.page || 1;

      const positions = dec
        .decode((message[1] as any).buffer)
        .split(",")
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      // choose the page, x, y closest to the current page
      const [page, x, y] = positions.reduce(
        (acc, cur) => {
          const [page, x, y] = cur.split(" ").map(Number);
          const current_page = currentPageNumber;
          // If page distance is the same, choose the last one
          if (
            Math.abs(page - current_page) <= Math.abs(acc[0] - current_page)
          ) {
            return [page, x, y];
          }
          return acc;
        },
        [Number.MAX_SAFE_INTEGER, 0, 0]
      );
      // console.log("resolved", page, x, y, "from", currentPageNumber);

      const pageToJump = page;
      if (pageToJump === Number.MAX_SAFE_INTEGER) {
        return;
      }

      if (!rootElem) {
        console.warn("null root elem");
      }
      if (rootElem) {
        /// Note: when it is really scrolled, it will trigger `svgDoc.addViewportChange`
        /// via `window.onscroll` event
        handleTypstLocation(pageToJump, x, y);
      }
      return;
    } else if (message[0] === "cursor") {
      // todo: aware height padding
      const [page, x, y] = dec
        .decode((message[1] as any).buffer)
        .split(" ")
        .map(Number);
      console.log("cursor", page, x, y);
      svgDoc!.setCursor(page, x, y);
      svgDoc!.addViewportChange(); // todo: synthesizing cursor event
      return;
    } else if (message[0] === "cursor-paths") {
      // todo: aware height padding
      const paths = JSON.parse(dec.decode((message[1] as any).buffer));
      console.log("cursor-paths", paths);
      svgDoc!.impl.setCursorPaths(paths);
      return;
    } else if (message[0] === "partial-rendering") {
      console.log("Experimental feature: partial rendering enabled");
      svgDoc!.setPartialRendering(true);
      return;
    } else if (message[0] === "invert-colors") {
      const rawStrategy = dec.decode((message[1] as any).buffer).trim();
      const strategy =
        INVERT_COLORS_STRATEGY.find((t) => t === rawStrategy) ||
        (JSON.parse(rawStrategy) as StrategyMap);
      console.log(
        "Experimental feature: invert colors strategy taken:",
        strategy
      );
      ensureInvertColors(strategy);
      return;
    } else if (message[0] === "outline") {
      console.log("Experimental feature: outline rendering");
      return;
    }

    svgDoc!.addChangement(message as any);
  }

  function setupSocket(): () => void {
    const batchMessageChannel = new Subject<ArrayBuffer>();

    hookedElem.value.document = svgDoc!;

    const dispose = () => {
      _disposed = true;
      svgDoc?.dispose();

      for (const sub of subsribes.splice(0, subsribes.length)) {
        sub.unsubscribe();
      }
    };

    reader.listen((message) => {
      if (isTypstPreviewMessage(message)) {
        const { content } = message.params;

        console.debug("Preview -> Webview:", content);

        let data: ArrayBuffer;
        if (content.format === "binary") {
          data = Buffer.from(content.data, "base64").buffer;
        } else {
          data = new TextEncoder().encode(content.data).buffer;
        }
        batchMessageChannel.next(data);
        return;
      }
    });

    // init
    sendWebSocketMessage(writer, "current");

    subsribes.push(
      batchMessageChannel
        .pipe(buffer(batchMessageChannel.pipe(debounceTime(0))))
        .pipe(
          tap((dataList) => {
            console.log(`batch ${dataList.length} messages`);
          })
        )
        .subscribe((dataList) => {
          dataList.map(processMessage);
        })
    );
    return dispose;
  }

  function ensureInvertColors(strategy: StrategyKey | StrategyMap) {
    if (!hookedElem.value) {
      return;
    }

    // Uniforms type of strategy to `TargetMap`
    if (typeof strategy === "string") {
      strategy = { rest: strategy };
    }

    let autoDecision: { value: boolean } | undefined = undefined;

    function determineInvertColor() {
      console.log("doesn't invert-colors because none of dark mode detected");
      return false;
    }
    /**
     * Handles invert colors mode based on a string enumerated strategy.
     * @param strategy - The strategy set by user.
     * @returns needInvertColor - Use or not use invert color.
     */
    function decide(strategy: StrategyKey) {
      switch (strategy) {
        case "never":
          return false;
        default:
          console.warn("Unknown invert-colors strategy:", strategy);
          return false;
        case "auto":
          return (autoDecision ||= { value: determineInvertColor() }).value;
        case "always":
          return true;
      }
    }

    hookedElem.value.classList.toggle(
      "invert-colors",
      decide(strategy?.rest || "never")
    );
    hookedElem.value.classList.toggle(
      "normal-image",
      !decide(strategy?.image || strategy?.rest || "never")
    );
  }

  function currentPosition(): TypstPosition | undefined {
    let result: TypstPosition | undefined = undefined;
    // The center of the window
    const cx = windowElem.value.clientWidth * 0.5;
    const cy = windowElem.value.clientHeight * 0.5;
    type ScrollRect = Pick<DOMRect, "left" | "top" | "width" | "height">;
    const handlePage = (pageBBox: ScrollRect, page: number) => {
      const x = pageBBox.left;
      const y = pageBBox.top;
      // console.log("page", page, x, y);

      const distance = Math.hypot(x - cx, y - cy);
      if (result === undefined || distance < result.distance) {
        result = { page, x, y, distance };
      }
    };

    const children = hookedElem.value.children;
    let nthPage = 0;
    for (let i = 0; i < children.length; i++) {
      if (children[i].tagName === "g") {
        nthPage++;
        const page = children[i] as SVGGElement;
        const bbox = page.getBoundingClientRect();
        /// Possibly a page that is not calculated yet
        if (bbox.bottom === 0 && bbox.top === 0) {
          continue;
        }
        handlePage(bbox, nthPage);
      }
    }
    return result;
  }

  function handleTypstLocation(pageNo: number, x: number, y: number): void {
    pageNo = pageNo - 1;

    const pageInner: TypstPreviewPageInner = Array.from(rootElem!.children)
      .filter(isTypstPreviewPageInner)
      .find((x) => x.getAttribute("data-page-number") === pageNo.toString())!;

    if (!pageInner) {
      console.warn("Can't find located typst page!");
      return;
    }

    const scale_x =
      rootElem!.getAttribute("width") / rootElem!.getAttribute("data-width");
    const scale_y =
      rootElem!.getAttribute("height") / rootElem!.getAttribute("data-height");

    const raw_y = y + pageInner.transform.baseVal[0].matrix.f;

    const scaled_x =
      x * scale_x +
      hookedElem.value.getBoundingClientRect().x -
      outerElem.value.getBoundingClientRect().x;
    const scaled_y = raw_y * scale_y;

    outerElem.value.scrollTo({
      behavior: "smooth",
      left: scaled_x - 32,
      top: scaled_y - 32,
    });

    triggerRipple(
      outerElem.value,
      scaled_x,
      scaled_y,
      "typst-jump-ripple",
      "typst-jump-ripple-effect .4s linear"
    );
  }

  function initTypstSvg(docRoot: SVGElement) {
    rootElem = docRoot as TypstPreviewDocumentRootElement;

    /// initialize pseudo links
    const elements = docRoot.getElementsByClassName("pseudo-link");
    for (let i = 0; i < elements.length; i++) {
      const elem = elements[i] as SVGAElement;
      elem.addEventListener("mousemove", mouseMoveToLink);
      elem.addEventListener("mouseleave", mouseLeaveFromLink);
    }
    return;

    // definition of event listeners
    function mouseMoveToLink(event: MouseEvent) {
      ignoredEvent(
        function () {
          const elements = getRelatedElements(event);
          if (elements === undefined || elements === null) {
            return;
          }
          for (let i = 0; i < elements.length; i++) {
            const elem = elements[i];
            if (elem.classList.contains("hover")) {
              continue;
            }
            elem.classList.add("hover");
          }
        },
        200,
        "mouse-move"
      );
    }

    function mouseLeaveFromLink(event: MouseEvent) {
      const elements = getRelatedElements(event);
      if (elements === undefined || elements === null) {
        return;
      }
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i];
        if (!elem.classList.contains("hover")) {
          continue;
        }
        elem.classList.remove("hover");
      }
    }
  }

  function setupDrag() {
    let lastPos = { x: 0, y: 0 };
    let moved = false;
    const containerElement = outerElem.value;
    const mouseMoveHandler = function (e: MouseEvent) {
      // How far the mouse has been moved
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;

      outerElem.value.scrollBy(-dx, -dy);
      lastPos = {
        x: e.clientX,
        y: e.clientY,
      };
      moved = true;
    };
    const goodDrag = (element: HTMLElement | null): element is HTMLElement => {
      if (!element) return false;
      // is not child of id=typst-container-top
      while (element) {
        if (element.id === "typst-container-top") {
          return false;
        }
        element = element.parentElement;
      }
      return true;
    };
    const mouseUpHandler = function () {
      outerElem.value.removeEventListener("mousemove", mouseMoveHandler);
      outerElem.value.removeEventListener("mouseup", mouseUpHandler);
      if (!goodDrag(containerElement)) {
        return;
      }
      if (!moved) {
        document.getSelection()?.removeAllRanges();
      }
      containerElement.style.cursor = "grab";
    };
    const mouseDownHandler = function (e: MouseEvent) {
      lastPos = {
        // Get the current mouse position
        x: e.clientX,
        y: e.clientY,
      };
      if (!goodDrag(containerElement)) return;
      const elementUnderMouse = e.target as HTMLElement | null;
      if (
        elementUnderMouse !== null &&
        elementUnderMouse.classList.contains("tsel")
      ) {
        return;
      }
      e.preventDefault();
      containerElement.style.cursor = "grabbing";
      moved = false;

      outerElem.value.addEventListener("mousemove", mouseMoveHandler);
      outerElem.value.addEventListener("mouseup", mouseUpHandler);
    };

    outerElem.value.addEventListener("mousedown", mouseDownHandler);
  }

  async function initPreviewInner() {
    const plugin = createTypstRenderer();
    await plugin.init({ getModule: () => renderModule });

    setupDrag();

    return new Promise<() => void>((resolveDispose) =>
      plugin.runWithSession((kModule) /* module kernel from wasm */ => {
        const initializePlugin = async () => {
          console.log(
            "plugin initialized, build info:",
            await rendererBuildInfo()
          );

          createSvgDocument(kModule);
          const wsDispose = setupSocket();

          return new Promise((resolve) => {
            // todo: plugin init and setup socket at the same time
            resolveDispose(() => {
              // dispose ws first
              wsDispose();
              // dispose kernel then
              resolve(undefined);
            });
          });
        };

        return initializePlugin();
      })
    );
  }

  return { initPreviewInner };
}
