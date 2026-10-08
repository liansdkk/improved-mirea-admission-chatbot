const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { ChromaClient } = require('chromadb');
const { extractPdfText } = require('./pdfExtract');
const { splitIntoChunks } = require('./chunking');

const DATA_DIR = path.join(__dirname, 'data');
const TRASH_DIR = path.join(__dirname, 'trash');
const EXCLUDED_FILE = 'Pr2024_Ob-ustanovlenii-razmera-platy-za-prozhivanie-v-obshchezhitiyakh_29.07.2025.pdf';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: 'http://localhost:8000' });

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// Список документов с датой последнего изменения
function listDocuments() {
  const files = fs.readdirSync(DATA_DIR).filter(
    file => (file.endsWith('.pdf') || file.endsWith('.txt')) && file !== EXCLUDED_FILE
  );

  return files.map(file => {
    const stats = fs.statSync(path.join(DATA_DIR, file));
    return { name: file, date: stats.mtime };
  });
}

// Список документов в корзине
function listTrash() {
  if (!fs.existsSync(TRASH_DIR)) return [];

  const files = fs.readdirSync(TRASH_DIR);
  return files.map(file => {
    const underscoreIndex = file.indexOf('_');
    const originalName = file.slice(underscoreIndex + 1);
    const stats = fs.statSync(path.join(TRASH_DIR, file));
    return { trashName: file, originalName, date: stats.mtime };
  });
}

// Добавление нового документа
async function addDocument(filename, buffer) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return indexDocument(filename, filePath, buffer);
}

// Общая логика индексации (переиспользуется и при добавлении, и при восстановлении)
async function indexDocument(filename, filePath, buffer) {
  let text = '';
  if (filename.endsWith('.pdf')) {
    text = await extractPdfText(filePath);
  } else if (filename.endsWith('.txt')) {
    text = buffer.toString('utf-8');
  } else {
    throw new Error('Поддерживаются только .pdf и .txt файлы');
  }

  const chunks = splitIntoChunks(text);
  const collection = await chroma.getOrCreateCollection({ name: 'admission_docs' });

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i]);
    await collection.add({
      ids: [`${filename}_${i}`],
      embeddings: [embedding],
      documents: [chunks[i]],
      metadatas: [{ source: filename }],
    });
  }

  return chunks.length;
}

// Удаление документа: перемещаем в корзину, а не удаляем безвозвратно
async function removeDocument(filename) {
  const filePath = path.join(DATA_DIR, filename);

  if (fs.existsSync(filePath)) {
    if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR);
    const timestamp = Date.now();
    const trashPath = path.join(TRASH_DIR, `${timestamp}_${filename}`);
    fs.renameSync(filePath, trashPath);
  }

  const collection = await chroma.getOrCreateCollection({ name: 'admission_docs' });
  await collection.delete({ where: { source: filename } });
}

// Восстановление документа из корзины: возвращаем файл и заново индексируем
async function restoreDocument(trashName) {
  const trashPath = path.join(TRASH_DIR, trashName);
  if (!fs.existsSync(trashPath)) {
    throw new Error('Файл не найден в корзине');
  }

  const underscoreIndex = trashName.indexOf('_');
  const originalName = trashName.slice(underscoreIndex + 1);
  const restoredPath = path.join(DATA_DIR, originalName);

  fs.renameSync(trashPath, restoredPath);

  const buffer = fs.readFileSync(restoredPath);
  const chunksCount = await indexDocument(originalName, restoredPath, buffer);

  return { originalName, chunksCount };
}

module.exports = { listDocuments, listTrash, addDocument, removeDocument, restoreDocument };