import { Buffer } from "buffer";
import { defaultWorkspacePath, FileSystemProvider } from "./fs-provider.mts";

// shz.al API base URL
const PASTEBIN_API = "https://shz.al";

/**
 * Upload content to shz.al pastebin
 */
export async function uploadToPastebin(
  fs: FileSystemProvider,
): Promise<string | null> {
  try {
    const content = await fs.getAllFilesAsJSON(defaultWorkspacePath);

    if (!content) {
      console.warn(`No content found in ${defaultWorkspacePath} directory`);
      return null;
    }
    const formData = new FormData();
    formData.append("c", content);
    const response = await fetch(PASTEBIN_API, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.url) {
      return (result.url as string).split("/").pop() ?? null;
    }
    return null;
  } catch (error) {
    console.error("Error uploading to pastebin:", error);
    return null;
  }
}

/**
 * Fetch content from shz.al pastebin
 */
export async function fetchFromPastebin(
  pasteId: string,
): Promise<Array<{ data: Uint8Array, path: string }> | null> {
  try {
    const response = await fetch(`${PASTEBIN_API}/${pasteId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonText = await response.text();
    const data = JSON.parse(jsonText);

    if (!data.files || typeof data.files !== 'object') {
      throw new Error("Invalid JSON format: missing files object");
    }
    const fileList = Object.entries(data.files)
      .map(([filePath, base64Content]) => {
        try {
          const fileContent = new Uint8Array(Buffer.from(base64Content as string, 'base64'));
          return {
            data: fileContent,
            path: filePath
          };
        } catch (error) {
          console.warn(`Failed to restore file ${filePath}:`, error);
          return null;
        }
      })
      .filter(item => item !== null);
    return fileList;
  } catch (error) {
    console.error("Error fetching from pastebin:", error);
    return null;
  }
}
