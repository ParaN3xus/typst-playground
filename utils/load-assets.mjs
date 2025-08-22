import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_EXTENSIONS = ['.ttc', '.ttf', '.otf', '.otc']
const SOURCE_EXTENSIONS = ['.typ']

async function getAllFiles(dir, extensions) {
    const files = []

    async function scan(directory) {
        const entries = await fs.readdir(directory, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                await scan(fullPath)
            } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
                files.push(fullPath)
            }
        }
    }
    await scan(dir)
    return files
}

async function getAllFontFiles(dir) {
    return getAllFiles(dir, FONT_EXTENSIONS)
}

async function getAllTypFiles(dir) {
    return getAllFiles(dir, SOURCE_EXTENSIONS)
}

export function assetsLoader() {
    return {
        name: 'assets-loader',
        resolveId(id) {
            if (id === 'virtual:fonts' || id === 'virtual:typ-files') return id
        },
        async load(id) {
            if (id === 'virtual:fonts') {
                const fontDir = path.resolve(__dirname, '../src/assets/fonts')
                const fontFiles = await getAllFontFiles(fontDir)

                const imports = fontFiles.map((file, index) => {
                    const absolutePath = path.resolve(file)
                    return `import font${index}Url from '${absolutePath}?url'`
                }).join('\n')

                const exports = fontFiles.map((file, index) => {
                    const fileName = path.basename(file)
                    return `{
                        name: "${fileName}",
                        url: font${index}Url,
                        async getData() {
                            const response = await fetch(font${index}Url)
                            return new Uint8Array(await response.arrayBuffer())
                        }
                    }`
                }).join(',')

                return `
                    ${imports}
                    export default [${exports}]
                `
            }

            if (id === 'virtual:typ-files') {
                const typDir = path.resolve(__dirname, '../src/assets/default-workspace')
                const typFiles = await getAllTypFiles(typDir)

                const imports = typFiles.map((file, index) => {
                    const absolutePath = path.resolve(file)
                    return `import typ${index}Content from '${absolutePath}?raw'`
                }).join('\n')

                const exports = typFiles.map((file, index) => {
                    const fileName = path.basename(file, '.typ')
                    const relativePath = path.relative(typDir, file)
                    return `{
                        name: "${fileName}",
                        path: "${relativePath}",
                        content: typ${index}Content,
                        async getData() {
                            return typ${index}Content
                        }
                    }`
                }).join(',')

                return `
                    ${imports}
                    export default [${exports}]
                `
            }
        }
    }
}
