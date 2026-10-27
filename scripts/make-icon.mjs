// Генерирует build/icon.ico (мультиразмерный) и build/icon.png из build/icon.svg
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svg = path.join(root, 'build', 'icon.svg')
const sizes = [16, 24, 32, 48, 64, 128, 256]

const svgBuf = fs.readFileSync(svg)

const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(svgBuf, { density: 384 }).resize(s, s).png().toBuffer())
)

// 256x256 PNG тоже сохраняем (на всякий случай / для не-Windows)
fs.writeFileSync(path.join(root, 'build', 'icon.png'), pngBuffers[pngBuffers.length - 1])

const ico = await pngToIco(pngBuffers)
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico)

console.log('OK: build/icon.ico (' + ico.length + ' bytes), build/icon.png created')
