import { Uri } from "vscode";
import {
  defaultEntryFilePath,
  defaultHiddenPath,
  defaultWorkspacePath,
} from "./path-constants.mts";

export const defaultWorkspaceUri = Uri.file(defaultWorkspacePath);
export const defaultEntryFileUri = Uri.file(defaultEntryFilePath);
export const defaultHiddenUri = Uri.file(defaultHiddenPath);
