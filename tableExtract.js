const fs = require('fs');

async function extractWithLayout(filePath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let buffer = '';
  let outputText = '';
  const footnotes = [];

  for (let pageNum = 2; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const sizes = content.items.map(item => Math.round(item.transform[3]));
    const mainSize = sizes.sort((a, b) =>
      sizes.filter(v => v === a).length - sizes.filter(v => v === b).length
    ).pop();

    const rows = {};
    for (const item of content.items) {
      const fontSize = Math.round(item.transform[3]);
      if (fontSize < mainSize - 1) {
        footnotes.push(item.str);
        continue;
      }
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x, text: item.str });
    }

    const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
    outputText += `\n--- Страница ${pageNum} ---\n`;

    for (const y of sortedYs) {
      const line = rows[y].sort((a, b) => a.x - b.x);
      let output = '';
      let prevX = null;
      for (const cell of line) {
        if (prevX !== null && cell.x - prevX > 40) {
          output += ' | ';
        }
        output += cell.text;
        prevX = cell.x + cell.text.length * 2;
      }
      output = output.trim();
      if (!output) continue;

      if (output.includes('|')) {
        const parts = output.split('|');
        parts[0] = (buffer + ' ' + parts[0]).trim();
        outputText += parts.join(' | ') + '\n\n';
        buffer = '';
      } else {
        buffer += (buffer ? ' ' : '') + output;
      }
    }
  }

  if (buffer) outputText += buffer + '\n\n';

  if (footnotes.length) {
    outputText += '\n--- Сноски ---\n' + footnotes.join(' ') + '\n';
  }

  fs.writeFileSync('./data/stoimost_prozhivaniya.txt', outputText, 'utf-8');
  console.log('Готово! Результат сохранён в data/stoimost_prozhivaniya.txt');
}

extractWithLayout('./data/Pr2024_Ob-ustanovlenii-razmera-platy-za-prozhivanie-v-obshchezhitiyakh_29.07.2025.pdf');