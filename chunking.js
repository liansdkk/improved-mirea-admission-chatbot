function splitIntoChunks(text, chunkSize = 700, overlap = 100) {
  // Сначала делим по абзацам (пустая строка = разделитель между смысловыми блоками)
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);

  const chunks = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= chunkSize) {
      // Абзац помещается целиком — не разрезаем его
      chunks.push(paragraph);
    } else {
      // Абзац слишком большой — досекаем его по символам, как раньше
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + chunkSize, paragraph.length);
        chunks.push(paragraph.slice(start, end));
        start += chunkSize - overlap;
      }
    }
  }

  return chunks;
}

module.exports = { splitIntoChunks };