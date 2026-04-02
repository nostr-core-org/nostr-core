#!/usr/bin/env node
import sharp from 'sharp'
import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

const HEADERS_DIR = new URL('../assets/headers/', import.meta.url).pathname
const PNG_DIR = join(HEADERS_DIR, 'png')

const files = (await readdir(HEADERS_DIR))
  .filter(f => f.endsWith('.svg'))

console.log(`Converting ${files.length} SVGs to PNG...\n`)

for (const file of files.sort()) {
  const svgPath = join(HEADERS_DIR, file)
  const pngName = basename(file, '.svg') + '.png'
  const pngPath = join(PNG_DIR, pngName)
  const svg = await readFile(svgPath)

  // Determine density based on viewBox width
  const isWide = svg.toString().includes('1200')
  const width = isWide ? 2400 : 1680 // 2x for retina

  await sharp(svg, { density: 150 })
    .resize(width)
    .png()
    .toFile(pngPath)

  console.log(`  ${pngName}`)
}

console.log('\nDone.')
