// Gera os PNGs do ícone e do splash a partir de assets/brand/logo.svg.
// Uso: npm run icons
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const VIOLETA = '#5B45FF';
const glyph = readFileSync(new URL('../assets/brand/logo.svg', import.meta.url), 'utf8');
const inner = glyph.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** Desenha o glifo no quadro 108x108, com escala em torno do centro. */
function svg({ bg = null, radius = 0, scale = 1, mono = false }) {
  const t = `translate(54 54) scale(${scale}) translate(-54 -54)`;
  const body = mono ? inner.replaceAll('#C9FF4D', '#FFFFFF') : inner;
  const rect = bg ? `<rect width="108" height="108" rx="${radius}" fill="${bg}"/>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="1024" height="1024">${rect}<g transform="${t}">${body}</g></svg>`);
}

async function png(buffer, file, size = 1024) {
  await sharp(buffer, { density: 384 }).resize(size, size).png().toFile(new URL(`../assets/images/${file}`, import.meta.url).pathname);
  console.log('ok', file);
}

// ícone "legado"/iOS: quadrado cheio (o sistema aplica a máscara)
await png(svg({ bg: VIOLETA }), 'icon.png');
// Android adaptativo: fundo sólido + glifo dentro da zona segura (círculo de 66dp em 108dp)
await png(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="1024" height="1024"><rect width="108" height="108" fill="${VIOLETA}"/></svg>`), 'android-icon-background.png');
await png(svg({ scale: 0.8 }), 'android-icon-foreground.png');
await png(svg({ scale: 0.8, mono: true }), 'android-icon-monochrome.png');
// splash e favicon: ícone com cantos arredondados, fundo transparente
await png(svg({ bg: VIOLETA, radius: 26 }), 'splash-icon.png');
await png(svg({ bg: VIOLETA, radius: 26 }), 'favicon.png', 48);
