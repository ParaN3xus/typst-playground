import { Message } from "vscode-jsonrpc/lib/common/messages";
import { TypstPreviewDocument } from "../typst-dom/index.preview.mts";
import { INVERT_COLORS_STRATEGY } from "./utils.mts";

export interface TypstPreviewWindowElement extends HTMLElement {
  initTypstSvg(docRoot: SVGElement): void;
  handleTypstLocation(elem: Element, page: number, x: number, y: number): void;
  typstWebsocket: Sendable;
}

export interface TypstPreviewHookedElement extends HTMLElement {
  document: TypstPreviewDocument;
  sourceMappingHandler?: (event: MouseEvent) => Promise<void>;
}

export type TypstPreviewMessageContent =
  | { format: "text"; data: string }
  | { format: "binary"; data: string };
export interface TypstPreviewMessageParams {
  content: TypstPreviewMessageContent;
}
export interface TypstPreviewMessage extends Message {
  method: "typst-preview";
  params: TypstPreviewMessageParams;
}

export interface Sendable {
  send: (data: string | ArrayBuffer) => Promise<void>;
}

/** The value of strategy constant */
export type StrategyKey = (typeof INVERT_COLORS_STRATEGY)[number];
/** The map from element kinds to strategy */
export type StrategyMap = Partial<Record<"rest" | "image", StrategyKey>>;

export interface TypstPosition {
  page: number;
  x: number;
  y: number;
  distance: number;
}

interface AttributedElement<T extends Record<string, any>> extends SVGElement {
  getAttribute<K extends keyof T>(name: K): T[K];
  setAttribute<K extends keyof T>(name: K, value: NonNullable<T[K]>): void;
}

type TypstPreviewDocumentRootElementAttributes = {
  "data-width": number;
  "data-height": number;
  width: number;
  height: number;
};

export type TypstPreviewDocumentRootElement =
  AttributedElement<TypstPreviewDocumentRootElementAttributes>;

export interface TypstPreviewPageInner extends HTMLElement {
  classList: DOMTokenList & {
    contains(token: "typst-page-inner"): true;
    contains(token: string): boolean;
  };
  transform: SVGAnimatedTransformList;
  getAttribute(qualifiedName: "data-page-number"): string;
  getAttribute(qualifiedName: string): string | null;
}
