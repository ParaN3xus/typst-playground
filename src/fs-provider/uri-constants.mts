import { Uri } from "vscode";
import {
	defaultEntryFilePath,
	defaultWorkspacePath,
} from "./path-constants.mts";

export const defaultWorkspaceUri = Uri.file(defaultWorkspacePath);
export const defaultEntryFileUri = Uri.file(defaultEntryFilePath);
