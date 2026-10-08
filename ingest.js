const fs = require('fs');
const path = require('path');
const { extractPdfText } = require('./pdfExtract');

const DATA_DIR = path.join(__dirname, 'data');
const EXCLUDED_FILE = 'Pr2024_Ob-ustanovlenii-razmera-platy-za-prozhivanie-v-obshchezhitiyakh_29.07.2025.pdf';

async function loadDocuments() {
  const files = fs.readdirSync(DATA_DIR);
  const documents = [];

  for (const file of files) {
    if (file === EXCLUDED_FILE) {
      continue; // этот файл заменён на stoimost_prozhivaniya.txt, полученный через tableExtract.js
    }

    const filePath = path.join(DATA_DIR, file);
    let text = '';

    if (file.endsWith('.pdf')) {
      text = await extractPdfText(filePath);
    } else if (file.endsWith('.txt')) {
      text = fs.readFileSync(filePath, 'utf-8');
    } else {
      continue; // пропускаем файлы других форматов
    }

    documents.push({ source: file, text });
    console.log(`✔ ${file}: извлечено ${text.length} символов`);
  }

  return documents;
}

loadDocuments();