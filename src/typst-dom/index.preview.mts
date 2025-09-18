export * from "./typst-doc.mjs";

import { provideDebugJumpDoc } from "./typst-debug-info.mjs";
import { composeDoc, provideDoc, TypstDocumentContext } from "./typst-doc.mjs";
import { provideSvgDoc } from "./typst-doc.svg.mjs";
import { provideOutlineDoc } from "./typst-outline.mjs";

export class TypstPreviewDocument extends provideDoc(
	composeDoc(
		TypstDocumentContext,
		provideOutlineDoc,
		provideSvgDoc,
		provideDebugJumpDoc,
	),
) {}
