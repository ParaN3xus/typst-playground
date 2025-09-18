// from myriad-dreamin/typst/tools/typst-dom, licensed under Apache 2.0
// originally from enter-tainer/typst-preview/addons/typst-dom, licensed under MIT

export * from "./typst-doc.mjs";

import { composeDoc, provideDoc, TypstDocumentContext } from "./typst-doc.mjs";
import { provideSvgDoc } from "./typst-doc.svg.mjs";

// export class TypstDocument extends provideDoc(
//   provideCanvasDoc(TypstDocumentContext)
// ) {}
/**
 * This is the default typst document class
 * If you want to use other features, you can compose your own document class by using `provideDoc` series functions
 *
 * @example
 *
 * Document with only canvas mode rendering:
 * ```ts
 * class MyDocument extends provideDoc(
 *   provideCanvasDoc(
 *     TypstDocumentContext
 *   )
 * ) {}
 */
export class TypstDocument extends provideDoc(
	composeDoc(TypstDocumentContext, provideSvgDoc),
) {}
