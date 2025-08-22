import * as vscode from "vscode";
import {
  InMemoryFileSystemProvider,
  registerFileSystemOverlay,
} from "@codingame/monaco-vscode-files-service-override";

export class FileSystemProvider extends InMemoryFileSystemProvider {
  protected textEncoder = new TextEncoder();

  constructor() {
    super();
  }

  async fileExists(uri: vscode.Uri) {
    try {
      await this.stat(uri);
      return true;
    } catch (error) {
      return false;
    }
  }

  async addFileToWorkspace(
    uriString: string,
    content: string,
  ): Promise<vscode.Uri> {
    const uri = vscode.Uri.file(uriString);

    await this.createDirectory(uri);
    await this.writeFile(
      uri,
      this.textEncoder.encode(content),
      {
        atomic: false,
        unlock: false,
        create: true,
        overwrite: true,
      },
    );

    // await vscode.workspace.openTextDocument(uri);
    return uri;
  }

  async createDirectory(uri: vscode.Uri) {
    const segments = uri.path.split("/").slice(1, -1);
    for (let i = 0; i < segments.length; i++) {
      const path = "/" + segments.slice(0, i + 1).join("/");
      const dir = vscode.Uri.file(path);
      if (!(await this.fileExists(dir))) {
        await this.mkdir(dir);
      }
    }
  }
}

export async function createFileSystemProvider(): Promise<FileSystemProvider> {
  const fileSystemProvider = new FileSystemProvider();
  registerFileSystemOverlay(1, fileSystemProvider);

  return fileSystemProvider;
}