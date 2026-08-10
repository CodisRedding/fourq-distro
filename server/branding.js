// Adds the Fourq Distro border to a listing photo before it goes out to any
// public marketplace — thin cream rule top/bottom with the wordmark in the
// top margin, styled after the Germs "(GI)" LP jacket layout.
const sharp = require('sharp');

const CREAM = '#f5f5f0';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const WORDMARK = 'FOURQ (DISTRO)';

// Diagonal "STILL SEALED" ribbon across the photo itself, for records marked
// factory sealed — applied before the border so it stays confined to the
// photo area rather than crossing the wordmark strip.
async function addSealedRibbon(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  const w = meta.width, h = meta.height;
  const bandH = Math.round(h * 0.13);
  const diag = Math.sqrt(w * w + h * h);
  const fontSize = Math.round(bandH * 0.52);

  const svg = `
    <svg width="${w}" height="${h}">
      <g transform="translate(${w / 2}, ${h / 2}) rotate(-32)">
        <rect x="${-diag / 2}" y="${-bandH / 2}" width="${diag}" height="${bandH}"
              fill="#c81e1e" opacity="0.92"/>
        <rect x="${-diag / 2}" y="${-bandH / 2}" width="${diag}" height="2.5" fill="#f5f5f0"/>
        <rect x="${-diag / 2}" y="${bandH / 2 - 2.5}" width="${diag}" height="2.5" fill="#f5f5f0"/>
        <text x="0" y="${fontSize * 0.34}" text-anchor="middle"
              font-family="'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif"
              font-size="${fontSize}" font-weight="900" letter-spacing="6"
              fill="#f5f5f0">STILL SEALED</text>
      </g>
    </svg>`;

  return sharp(inputBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toBuffer();
}

async function addBorder(inputBuffer, options = {}) {
  const source = options.sealed ? await addSealedRibbon(inputBuffer) : inputBuffer;
  const { data, info } = await sharp(source).toBuffer({ resolveWithObject: true });
  const topMargin = Math.round(info.width * 0.08);
  const bottomMargin = Math.round(info.width * 0.0275);
  const fontSize = Math.round(info.width * 0.0325);
  const canvasW = info.width;
  const canvasH = info.height + topMargin + bottomMargin;

  const svg = `
    <svg width="${canvasW}" height="${canvasH}">
      <rect width="${canvasW}" height="${canvasH}" fill="#111111"/>
      <text x="${Math.round(canvasW * 0.03)}" y="${Math.round(topMargin * 0.6)}"
            font-family="${FONT}" font-size="${fontSize}" font-weight="400"
            letter-spacing="1" fill="${CREAM}">${WORDMARK}</text>
      <rect x="0" y="${topMargin - 4}" width="${canvasW}" height="2" fill="${CREAM}"/>
      <rect x="0" y="${canvasH - 6}" width="${canvasW}" height="2" fill="${CREAM}"/>
    </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: data, top: topMargin, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

module.exports = { addBorder, addSealedRibbon };
