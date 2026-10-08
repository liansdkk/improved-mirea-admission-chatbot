const fs = require('fs');
const pdf = require('pdf-parse');

// Извлекает структурированные табличные строки через координатный метод
async function extractTableLines(filePath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let buffer = '';
  const tableLines = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const sizes = content.items.map(item => Math.round(item.transform[3]));
    const mainSize = sizes.length
      ? sizes.sort((a, b) =>
          sizes.filter(v => v === a).length - sizes.filter(v => v === b).length
        ).pop()
      : 0;

    const rows = {};
    for (const item of content.items) {
      const fontSize = Math.round(item.transform[3]);
      if (fontSize < mainSize - 1) continue; // пропускаем сноски мелким шрифтом

      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x, text: item.str });
    }

    const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);

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
        tableLines.push(parts.join(' | '));
        buffer = '';
      } else {
        buffer += (buffer ? ' ' : '') + output;
      }
    }
  }

  return tableLines;
}

// Главная функция: обычный текст + отдельно структурированные таблицы
async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const baseData = await pdf(buffer);
  let result = baseData.text;

  try {
    const tableLines = await extractTableLines(filePath);
    // Оставляем только строки, где реально нашлось 3+ колонки —
    // это отсекает случайные ложные срабатывания на обычном тексте
    const realTableLines = tableLines.filter(
      line => (line.match(/\|/g) || []).length >= 2
    );
    if (realTableLines.length > 0) {
      result += '\n\n--- Структурированные табличные данные ---\n';
      result += realTableLines.join('\n');
    }
  } catch (err) {
    console.log(`  (не удалось извлечь таблицы координатным методом: ${err.message})`);
  }

  return result;
}

module.exports = { extractPdfText };