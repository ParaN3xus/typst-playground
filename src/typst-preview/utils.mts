import { Buffer } from "buffer";
import { Observable } from "rxjs";
import { BrowserMessageWriter } from "vscode-languageclient/browser";
import {
	TypstPreviewMessage,
	TypstPreviewMessageContent,
	TypstPreviewPageInner,
} from "./types";

export function createResizeObservable(element: HTMLElement) {
	return new Observable((observer) => {
		const resizeObserver = new ResizeObserver((entries) => {
			observer.next(entries);
		});

		resizeObserver.observe(element);

		return () => {
			resizeObserver.unobserve(element);
			resizeObserver.disconnect();
		};
	});
}

export async function sendWebSocketMessage(
	writer: BrowserMessageWriter,
	data: string | ArrayBuffer,
): Promise<void> {
	const content: TypstPreviewMessageContent =
		typeof data === "string"
			? {
					format: "text",
					data: data,
				}
			: {
					format: "binary",
					data: Buffer.from(data).toString("base64"),
				};

	console.debug("Webview -> Preview:", content);
	const msg: TypstPreviewMessage = {
		jsonrpc: "2.0",
		method: "typst-preview",
		params: {
			content,
		},
	};
	await writer.write(msg);
}

/** The strategy to set invert colors, see editors/vscode/package.json for enum descriptions */
export const INVERT_COLORS_STRATEGY = ["never", "auto", "always"] as const;

export function isTypstPreviewMessage(
	message: any,
): message is TypstPreviewMessage {
	return (
		message &&
		typeof message === "object" &&
		"method" in message &&
		message.method === "typst-preview" &&
		"params" in message
	);
}

export function isTypstPreviewPageInner(
	element: Element | null | undefined,
): element is TypstPreviewPageInner {
	return !!(
		element &&
		element instanceof SVGElement &&
		element.classList.contains("typst-page-inner") &&
		element.getAttribute("data-page-number") !== null &&
		"transform" in element
	);
}

// debounce https://stackoverflow.com/questions/23181243/throttling-a-mousemove-event-to-fire-no-more-than-5-times-a-second
// ignore fast events, good for capturing double click
// @param (callback): function to be run when done
// @param (delay): integer in milliseconds
// @param (id): string value of a unique event id
// @doc (event.timeStamp): http://api.jquery.com/event.timeStamp/
// @bug (event.currentTime): https://bugzilla.mozilla.org/show_bug.cgi?id=238041
export const ignoredEvent = (function () {
	const last: Record<string, any> = {};
	let diff: number;
	let time: number;

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

export function getRelatedElements(event: any) {
	let relatedElements = event.target.relatedElements;
	if (relatedElements === undefined || relatedElements === null) {
		relatedElements = event.target.relatedElements = searchIntersections(
			event.target,
		);
	}
	return relatedElements;
}

function overLapping(a: Element, b: Element) {
	const aRect = a.getBoundingClientRect();
	const bRect = b.getBoundingClientRect();

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
}

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
}
