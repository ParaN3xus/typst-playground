// mostly from myriad-dreamin/typst/tools/typst-preview-frontend/ws.ts

import { PreviewMode } from "../typst-dom/typst-doc.mjs";
import { TypstPreviewDocument as TypstDocument } from "../typst-dom/index.preview.mjs";
import { createTypstRenderer, rendererBuildInfo, RenderSession } from "@myriaddreamin/typst.ts/dist/esm/renderer.mjs";
import {
  Subject,
  Subscription,
  buffer,
  debounceTime,
  fromEvent,
  tap,
} from "rxjs";
import { BrowserMessageReader, BrowserMessageWriter } from "vscode-languageclient/browser";
import renderModule from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import { Buffer } from 'buffer';
export { PreviewMode } from "../typst-dom/typst-doc.mjs";

const NOT_AVAILABLE = "current not available";
const enc = new TextEncoder();
const dec = new TextDecoder();
const COMMA = enc.encode(",");


import { Observable } from 'rxjs';
import { triggerRipple } from "../typst-dom/typst-animation.mts";

const createResizeObservable = (element: HTMLElement) => {
  return new Observable(observer => {
    const resizeObserver = new ResizeObserver(entries => {
      observer.next(entries);
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.unobserve(element);
      resizeObserver.disconnect();
    };
  });
};

export async function initPreviewInner(
  windowElem: HTMLElement,
  outerElem: HTMLElement,
  hookedElem: HTMLElement,
  previewMode: PreviewMode,
  isContentPreview: boolean,
  reader: BrowserMessageReader,
  writer: BrowserMessageWriter
) {
  const subsribes: Subscription[] = [];

  const sendWebSocketMessage = async (data: string | ArrayBuffer) => {
    const content =
      typeof data === "string"
        ? { format: "text", data }
        : { format: "binary", data: Array.from(new Uint8Array(data)) };

    console.log("Webview -> Preview:", content)
    await writer.write({
      jsonrpc: "2.0",
      method: "typst-preview",
      params: {
        content: content,
      },
    });
  };

  function createSvgDocument(kModule: RenderSession) {
    if (hookedElem.firstElementChild?.tagName !== "svg") {
      hookedElem.innerHTML = "";
    }

    windowElem.initTypstSvg = initTypstSvg;
    windowElem.typstWebsocket = {
      send: sendWebSocketMessage
    }

    const resizeTarget = document.getElementById("typst-container-main")!;

    const svgDoc = new TypstDocument({
      windowElem,
      hookedElem,
      kModule,
      previewMode,
      isContentPreview,
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
      createResizeObservable(windowElem).subscribe(() => {
        svgDoc.addViewportChange();
      })
    );

    if (!isContentPreview) {
      subsribes.push(
        fromEvent(windowElem, "scroll")
          .pipe(debounceTime(500))
          .subscribe(() => {
            svgDoc.addViewportChange()
          })
      );
    }

    // Handle messages sent from the extension to the webview
    subsribes.push(
      fromEvent<MessageEvent>(windowElem, "message").subscribe((event) => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
          case "outline": {
            svgDoc.setOutineData(message.outline);
            break;
          }
        }
      })
    );
    return svgDoc;
  }

  function setupSocket(svgDoc: TypstDocument): () => void {
    // window.documents.push(svgDoc);

    // todo: reconnect setTimeout(() => setupSocket(svgDoc), 1000);
    const batchMessageChannel = new Subject<ArrayBuffer>();

    hookedElem.document = svgDoc;

    const dispose = () => {
      disposed = true;
      svgDoc.dispose();

      for (const sub of subsribes.splice(0, subsribes.length)) {
        sub.unsubscribe();
      }
    };

    reader.listen((message) => {
      if ('method' in message && message.method === 'typst-preview') {
        const { content } = message.params;

        console.log("Preview -> Webview:", content)

        let data: ArrayBuffer;
        if (content.format === 'binary') {
          data = Buffer.from(content.data, 'base64').buffer;
        } else {
          data = new TextEncoder().encode(content.data).buffer;
        }
        console.log("Preview Frontend: sending received data to batch msg channel, length is", data.byteLength)
        batchMessageChannel.next(data);
        return;
      }
    });

    sendWebSocketMessage("current");

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

    function processMessage(data: ArrayBuffer) {
      console.log("Preview frontend: processing data", data.byteLength)
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
      console.log("recv", message[0], messageData.length);
      // console.log(message[0], message[1].length);
      if (isContentPreview) {
        // whether to scroll to the content preview when user updates document
        const autoScrollContentPreview = true;
        if (!autoScrollContentPreview && message[0] === "jump") {
          return;
        }

        // "viewport": viewport change to document doesn't affect content preview
        // "partial-rendering": content previe always render partially
        // "cursor": currently not supported
        if (
          message[0] === "viewport" ||
          message[0] === "partial-rendering" ||
          message[0] === "cursor"
        ) {
          return;
        }
      }

      if (message[0] === "jump" || message[0] === "viewport") {
        const rootElem = hookedElem.firstElementChild;

        // todo: aware height padding
        let currentPageNumber = 1;

        currentPageNumber = currentPosition(windowElem, hookedElem)?.page || 1;

        let positions = dec
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

        let pageToJump = page;
        if (pageToJump === Number.MAX_SAFE_INTEGER) {
          return;
        }

        if (rootElem) {
          /// Note: when it is really scrolled, it will trigger `svgDoc.addViewportChange`
          /// via `window.onscroll` event
          handleTypstLocation(hookedElem.children[0], pageToJump, x, y);
        }
        return;
      } else if (message[0] === "cursor") {
        // todo: aware height padding
        const [page, x, y] = dec
          .decode((message[1] as any).buffer)
          .split(" ")
          .map(Number);
        console.log("cursor", page, x, y);
        svgDoc.setCursor(page, x, y);
        svgDoc.addViewportChange(); // todo: synthesizing cursor event
        return;
      } else if (message[0] === "cursor-paths") {
        // todo: aware height padding
        const paths = JSON.parse(dec.decode((message[1] as any).buffer));
        console.log("cursor-paths", paths);
        svgDoc.impl.setCursorPaths(paths);
        return;
      } else if (message[0] === "partial-rendering") {
        console.log("Experimental feature: partial rendering enabled");
        svgDoc.setPartialRendering(true);
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
        ensureInvertColors(document.getElementById("typst-app"), strategy);
        return;
      } else if (message[0] === "outline") {
        console.log("Experimental feature: outline rendering");
        return;
      }

      svgDoc.addChangement(message as any);
    }

    return dispose;
  }

  let plugin = createTypstRenderer();
  await plugin.init({ getModule: () => renderModule });

  setupDrag(outerElem,)

  return new Promise<() => void>((resolveDispose) =>
    plugin.runWithSession((kModule) /* module kernel from wasm */ => {
      return new Promise(async (kernelDispose) => {
        console.log("plugin initialized, build info:", await rendererBuildInfo());

        const wsDispose = setupSocket(createSvgDocument(kModule));

        // todo: plugin init and setup socket at the same time
        resolveDispose(() => {
          // dispose ws first
          wsDispose();
          // dispose kernel then
          kernelDispose(undefined);
        });
      });
    }),
  );
}


/** The strategy to set invert colors, see editors/vscode/package.json for enum descriptions */
const INVERT_COLORS_STRATEGY = ["never", "auto", "always"] as const;
/** The value of strategy constant */
type StrategyKey = (typeof INVERT_COLORS_STRATEGY)[number];
/** The map from element kinds to strategy */
type StrategyMap = Partial<Record<"rest" | "image", StrategyKey>>;

function ensureInvertColors(root: HTMLElement | null, strategy: StrategyKey | StrategyMap) {
  if (!root) {
    return;
  }

  // Uniforms type of strategy to `TargetMap`
  if (typeof strategy === "string") {
    strategy = { rest: strategy };
  }

  let autoDecision: { value: boolean } | undefined = undefined;
  /**
   * Handles invert colors mode based on a string enumerated strategy.
   * @param strategy - The strategy set by user.
   * @returns needInvertColor - Use or not use invert color.
   */
  const decide = (strategy: StrategyKey) => {
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
  };

  root.classList.toggle("invert-colors", decide(strategy?.rest || "never"));
  root.classList.toggle("normal-image", !decide(strategy?.image || strategy?.rest || "never"));

  function determineInvertColor() {
    console.log("doesn't invert-colors because none of dark mode detected");
    return false;
  }
}

function currentPosition(windowElem: Element, hookedElem: Element) {
  interface TypstPosition {
    page: number;
    x: number;
    y: number;
    distance: number;
  }

  let result: TypstPosition | undefined = undefined;
  // The center of the window
  const cx = windowElem.clientWidth * 0.5;
  const cy = windowElem.clientHeight * 0.5;
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

  const renderMode = hookedElem.getAttribute("data-render-mode");
  if (renderMode === "canvas") {
    const pages = hookedElem.querySelectorAll<HTMLDivElement>(".typst-page");

    for (const page of pages) {
      const pageNumber = Number.parseInt(page.getAttribute("data-page-number")!);

      const bbox = page.getBoundingClientRect();
      handlePage(bbox, pageNumber);
    }
    return result;
  }

  const children = hookedElem.children;
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
};


function handleTypstLocation(elem: Element, pageNo: number, x: number, y: number) {
  pageNo = pageNo - 1;

  const pageInner = Array.from(elem.children).find(child =>
    child.classList.contains('typst-page-inner') &&
    child.getAttribute('data-page-number') === pageNo.toString()
  );

  const scale_x = elem.getAttribute('width') / elem.getAttribute('data-width')
  const scale_y = elem.getAttribute('height') / elem.getAttribute('data-height')

  const raw_y = y + pageInner.transform.baseVal[0].matrix.f

  const scaled_x = x * scale_x + elem.parentElement.getBoundingClientRect().x - elem.parentElement?.parentElement.getBoundingClientRect().x
  const scaled_y = raw_y * scale_y

  elem.parentElement?.parentElement.scrollTo({
    behavior: "smooth",
    left: scaled_x - 32,
    top: scaled_y - 32
  });

  triggerRipple(
    elem.parentElement.parentElement,
    scaled_x,
    scaled_y,
    "typst-jump-ripple",
    "typst-jump-ripple-effect .4s linear",
  );
};



function layoutText(svg: SVGElement) {
  const divs = svg.querySelectorAll<HTMLDivElement>(".tsel");
  const canvas = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas",
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const layoutBegin = performance.now();

  for (let d of divs) {
    if (d.getAttribute("data-typst-layout-checked")) {
      continue;
    }

    if (d.style.fontSize) {
      const foreignObj = d.parentElement!;
      const innerText = d.innerText;
      const targetWidth = Number.parseFloat(foreignObj.getAttribute("width") || "0") || 0;
      const currentX = Number.parseFloat(foreignObj.getAttribute("x") || "0") || 0;
      ctx.font = `${d.style.fontSize} sans-serif`;
      const selfWidth = ctx.measureText(innerText).width;

      const scale = targetWidth / selfWidth;

      d.style.transform = `scaleX(${scale})`;
      foreignObj.setAttribute("width", selfWidth.toString());
      foreignObj.setAttribute("x", (currentX - (selfWidth - targetWidth) * 0.5).toString());

      d.setAttribute("data-typst-layout-checked", "1");
    }
  }

  console.log(`layoutText used time ${performance.now() - layoutBegin} ms`);
}

// debounce https://stackoverflow.com/questions/23181243/throttling-a-mousemove-event-to-fire-no-more-than-5-times-a-second
// ignore fast events, good for capturing double click
// @param (callback): function to be run when done
// @param (delay): integer in milliseconds
// @param (id): string value of a unique event id
// @doc (event.timeStamp): http://api.jquery.com/event.timeStamp/
// @bug (event.currentTime): https://bugzilla.mozilla.org/show_bug.cgi?id=238041
let ignoredEvent = (function () {
  let last: Record<string, any> = {},
    diff: number,
    time: number;

  return function (callback: () => void, delay: number, id: string) {
    time = new Date().getTime();
    id = id || "ignored event";
    diff = last[id] ? time - last[id] : time;

    if (diff > delay) {
      last[id] = time;
      callback();
    }
  };
})();

function getRelatedElements(event: any) {
  let relatedElements = event.target.relatedElements;
  if (relatedElements === undefined || relatedElements === null) {
    relatedElements = event.target.relatedElements = searchIntersections(event.target);
  }
  return relatedElements;
};

function overLapping(a: Element, b: Element) {
  var aRect = a.getBoundingClientRect();
  var bRect = b.getBoundingClientRect();

  return (
    !(
      aRect.right < bRect.left ||
      aRect.left > bRect.right ||
      aRect.bottom < bRect.top ||
      aRect.top > bRect.bottom
    ) &&
    /// determine overlapping by area
    (Math.abs(aRect.left - bRect.left) + Math.abs(aRect.right - bRect.right)) /
    Math.max(aRect.width, bRect.width) <
    0.5 &&
    (Math.abs(aRect.bottom - bRect.bottom) + Math.abs(aRect.top - bRect.top)) /
    Math.max(aRect.height, bRect.height) <
    0.5
  );
};

function searchIntersections(root: Element) {
  let parent = undefined,
    current = root;
  while (current) {
    if (current.classList.contains("typst-group")) {
      parent = current;
      break;
    }
    current = current.parentElement!;
  }
  if (!parent) {
    console.log("no group found");
    return;
  }
  const group = parent;
  const children = group.children;
  const childCount = children.length;

  const res = [];

  for (let i = 0; i < childCount; i++) {
    const child = children[i];
    if (!overLapping(child, root)) {
      continue;
    }
    res.push(child);
  }

  return res;
};

function initTypstSvg(docRoot: SVGElement) {
  /// initialize pseudo links
  var elements = docRoot.getElementsByClassName("pseudo-link");
  for (var i = 0; i < elements.length; i++) {
    let elem = elements[i] as SVGAElement;
    elem.addEventListener("mousemove", mouseMoveToLink);
    elem.addEventListener("mouseleave", mouseLeaveFromLink);
  }

  /// initialize text layout at client side
  if (false) {
    setTimeout(() => {
      layoutText(docRoot);
    }, 0);
  }

  return;

  function mouseMoveToLink(event: MouseEvent) {
    ignoredEvent(
      function () {
        const elements = getRelatedElements(event);
        if (elements === undefined || elements === null) {
          return;
        }
        for (var i = 0; i < elements.length; i++) {
          var elem = elements[i];
          if (elem.classList.contains("hover")) {
            continue;
          }
          elem.classList.add("hover");
        }
      },
      200,
      "mouse-move",
    );
  }

  function mouseLeaveFromLink(event: MouseEvent) {
    const elements = getRelatedElements(event);
    if (elements === undefined || elements === null) {
      return;
    }
    for (var i = 0; i < elements.length; i++) {
      var elem = elements[i];
      if (!elem.classList.contains("hover")) {
        continue;
      }
      elem.classList.remove("hover");
    }
  }
};

function setupDrag(windowElem: Element) {
  let lastPos = { x: 0, y: 0 };
  let moved = false;
  let containerElement = windowElem;
  const mouseMoveHandler = function (e: MouseEvent) {
    // How far the mouse has been moved
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;

    windowElem.scrollBy(-dx, -dy);
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
    windowElem.removeEventListener("mousemove", mouseMoveHandler);
    windowElem.removeEventListener("mouseup", mouseUpHandler);
    if (!goodDrag(containerElement)) {
      return
    };
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
    if (elementUnderMouse !== null && elementUnderMouse.classList.contains("tsel")) {
      return;
    }
    e.preventDefault();
    containerElement.style.cursor = "grabbing";
    moved = false;

    windowElem.addEventListener("mousemove", mouseMoveHandler);
    windowElem.addEventListener("mouseup", mouseUpHandler);
  };

  windowElem.addEventListener("mousedown", mouseDownHandler);
}
