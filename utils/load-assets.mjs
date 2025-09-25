import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_EXTENSIONS = [".ttc", ".ttf", ".otf", ".otc"];

async function getAllFiles(dir, extensions) {
	const files = [];

	async function scan(directory) {
		const entries = await fs.readdir(directory, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await scan(fullPath);
			} else if (
				!extensions ||
				extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
			) {
				files.push(fullPath);
			}
		}
	}
	await scan(dir);
	return files;
}

async function getAllFontFiles(dir) {
	return getAllFiles(dir, FONT_EXTENSIONS);
}

async function getAllDefaultWorkspaceFiles(dir) {
	return getAllFiles(dir, null);
}

async function calculateFileHash(filePath) {
	const content = await fs.readFile(filePath);
	return crypto.createHash('md5').update(content).digest('hex');
}

export function assetsLoader() {
	return {
		name: "assets-loader",
		resolveId(id) {
			if (id === "virtual:fonts" || id === "virtual:default-workspace")
				return id;
		},
		async load(id) {
			if (id === "virtual:fonts") {
				return generateVirtualModule({
					dir: path.resolve(__dirname, "../src/assets/fonts"),
					getFiles: getAllFontFiles,
					prefix: "font",
					suffix: "?url",
					getPathFromFile: (file, _) => file,
					hash: true,
				});
			}

			if (id === "virtual:default-workspace") {
				const defaultWorkspaceDir = path.resolve(
					__dirname,
					"../src/assets/default-workspace",
				);
				return generateVirtualModule({
					dir: defaultWorkspaceDir,
					getFiles: getAllDefaultWorkspaceFiles,
					prefix: "ws",
					suffix: "?url",
					getPathFromFile: (file, dir) => path.relative(dir, file),
					hash: false,
				});
			}
		},
	};
}

async function generateVirtualModule(options) {
	const { dir, getFiles, prefix, suffix, getPathFromFile, hash = false } = options;

	const files = await getFiles(dir);

	const imports = files
		.map((file, index) => {
			const absolutePath = path.resolve(file).replaceAll(/\\/g, "\\\\");
			return `import ${prefix}${index}Url from '${absolutePath}${suffix}'`;
		})
		.join("\n");

	const exports = await Promise.all(files
		.map(async (file, index) => {
			const name = path.basename(file);
			const pathProp = `path: "${getPathFromFile(file, dir)}",`;
			const urlVariable = prefix + index;
			const hashProp = hash ? `hash: "${await calculateFileHash(file)}",` : '';
			const getData = `async getData() {
            const response = await fetch(${urlVariable}Url)
            return new Uint8Array(await response.arrayBuffer())
        }`;

			return `{
            name: "${name}",
            ${pathProp}
            ${hashProp}
            url: ${prefix}${index}Url,
            ${getData}
        }`;
		}));

	return `
        ${imports}
        export default [${exports.join(",")}]
    `;
}
