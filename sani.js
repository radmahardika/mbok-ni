// SANI — Staf Andalan Mbok Ni.
// Sprite pixel 24x32: perempuan Jawa bersanggul, kebaya cokelat, jarik batik.

const PALETTE = {
  K: '#3a2314', // garis luar
  H: '#2a1b12', // rambut
  h: '#4a3324', // kilau rambut
  S: '#e2a874', // kulit
  s: '#c88a57', // bayangan kulit
  E: '#24160e', // mata
  R: '#ec8f78', // pipi merona
  M: '#a13a2c', // bibir
  B: '#8b5a2b', // kebaya cokelat
  b: '#6a421d', // lipatan kebaya
  L: '#f6e7c8', // kutu baru (dalaman)
  G: '#e9c34a', // bros emas
  J: '#4e321a', // jarik dasar
  j: '#c9994f', // motif batik
  W: '#ffffff', // melati
};

// Kepala dan badan dipisah supaya wajah bisa berganti ekspresi.
const HAIR = [
  '........................',
  '.........KKKKKKK........',
  '.......KKHHHHHHHKK......',
  '......KHHHhHSHHHHHK.....',
  '.....KHHHHHHSHHHHHHK....',
  '..KKKKHHhHHHSHHHHHHK....',
  '.KWWWKHHHHHHHHHHHHHHK...',
  '.KWGWKHHHHHHHHHHHHHHK...',
];

const FACES = {
  biasa: [
    '.....KHHSSSSSSSSSSHHK...',
    '.....KHSSSSSSSSSSSSHK...',
    '.....KHSSEESSSSEESSHK...',
    '.....KSSSEESSSSEESSSK...',
    '.....KSRRSSSSSSSSRRSK...',
    '.....KSSSSSMSSMSSSSSK...',
    '......KSSSSSMMSSSSSK....',
    '.......KsSSSSSSSSsK.....',
  ],
  senang: [
    '.....KHHSSSSSSSSSSHHK...',
    '.....KHSSSSSSSSSSSSHK...',
    '.....KHSSESSSSSSESSHK...',
    '.....KSSESESSSSESESSK...',
    '.....KSRRSSSSSSSSRRSK...',
    '.....KSSSSMSSSSMSSSSK...',
    '......KSSSSMMMMSSSSK....',
    '.......KsSSSSSSSSsK.....',
  ],
  khawatir: [
    '.....KHHSSSSSSSSSSHHK...',
    '.....KHSSSESSSSESSSHK...',
    '.....KHSSEESSSSEESSHK...',
    '.....KSSSEESSSSEESSSK...',
    '.....KSSSSSSSSSSSSSSK...',
    '.....KSSSSSSMMSSSSSSK...',
    '......KSSSSMSSMSSSSK....',
    '.......KsSSSSSSSSsK.....',
  ],
  kedip: [
    '.....KHHSSSSSSSSSSHHK...',
    '.....KHSSSSSSSSSSSSHK...',
    '.....KHSSSSSSSSSSSSHK...',
    '.....KSSSEESSSSEESSSK...',
    '.....KSRRSSSSSSSSRRSK...',
    '.....KSSSSSMSSMSSSSSK...',
    '......KSSSSSMMSSSSSK....',
    '.......KsSSSSSSSSsK.....',
  ],
};

const BODY = [
  '.........KKssssKK.......',
  '.......KKBBLSSLBBKK.....',
  '......KBBBBLSSLBBBBK....',
  '.....KBBBBBLGGLBBBBBK...',
  '.....KBBbBBLLLLBBbBBK...',
  '.....KBBbBBLGGLBBbBBK...',
  '.....KBBbBBLLLLBBbBBK...',
  '.....KBBbBBLGGLBBbBBK...',
  '.....KBBbKSSSSSSKbBBK...',
  '.....KBBbKSSSSSSKbBBK...',
  '.....KBBBBKKKKKKBBBBK...',
  '......KJJjJJjJJjJJjK....',
  '......KJjJJjJJjJJjJK....',
  '......KJJjJJjJJjJJjK....',
  '......KJjJJjJJjJJjJK....',
  '......KJJjJJjJJjJJjK....',
  '......KKKKKKKKKKKKKK....',
];

// Tangan kanan terangkat (telunjuk ke atas) untuk ekspresi "ingat".
const RAISED_HAND = (() => {
  const px = [[6, 21, 'K'], [7, 21, 'S'], [7, 22, 'K'], [8, 21, 'S'], [8, 22, 'K']];
  for (const y of [9, 10, 11]) px.push([y, 21, 'S'], [y, 22, 'S'], [y, 23, 'K']);
  px.push([12, 21, 'K'], [12, 22, 'K'], [12, 23, 'K']);
  for (let y = 13; y <= 18; y++) px.push([y, 21, 'B'], [y, 22, 'B'], [y, 23, 'K']);
  px.push([16, 20, 'K'], [17, 19, 'K'], [17, 20, 'B'], [18, 19, 'B'], [18, 20, 'B']);
  return px;
})();

function grid(mood) {
  const face = FACES[mood] || FACES.biasa;
  const rows = [...HAIR, ...face, ...BODY].map((r) => r.padEnd(24, '.').slice(0, 24).split(''));
  for (let x = 2; x <= 4; x++) rows[8][x] = 'K'; // bawah bunga melati
  return rows;
}

// Hasilkan SVG sprite. Ekspresi: biasa, senang, khawatir, ingat, kedip.
export function saniSVG(mood = 'biasa') {
  const faceMood = mood === 'ingat' ? 'senang' : mood;
  const rows = grid(faceMood);
  if (mood === 'ingat') for (const [y, x, c] of RAISED_HAND) rows[y][x] = c;
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      if (PALETTE[c]) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PALETTE[c]}"/>`;
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" shape-rendering="crispEdges" role="img" aria-label="SANI">${rects}</svg>`;
}
