import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_EXTENSIONS = ['.ttc', '.ttf', '.otf', '.otc']

async function getAllFontFiles(dir) {
    const files = []

    async function scan(directory) {
        const entries = await fs.readdir(directory, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                await scan(fullPath)
            } else if (FONT_EXTENSIONS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
                files.push(fullPath)
            }
        }
    }
    await scan(dir)
    return files
}
export function fontLoader() {
    return {
        name: 'font-loader',
        resolveId(id) {
            if (id === 'virtual:fonts') return id
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
        }
    }
}
