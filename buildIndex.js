const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { ChromaClient } = require('chromadb');
const { extractPdfText } = require('./pdfExtract');
const { splitIntoChunks } = require('./chunking');

const DATA_DIR = path.join(__dirname, 'data');
const EXCLUDED_FILE = 'Pr2024_Ob-ustanovlenii-razmera-platy-za-prozhivanie-v-obshchezhitiyakh_29.07.2025.pdf';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: 'http://localhost:8000' });

async function loadDocuments() {
  const files = fs.readdirSync(DATA_DIR);
  const documents = [];

  for (const file of files) {
    if (file === EXCLUDED_FILE) continue;
    const filePath = path.join(DATA_DIR, file);
    let text = '';

    if (file.endsWith('.pdf')) {
      text = await extractPdfText(filePath);
    } else if (file.endsWith('.txt')) {
      text = fs.readFileSync(filePath, 'utf-8');
    } else {
      continue;
    }

    documents.push({ source: file, text });
  }
  return documents;
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function buildIndex() {
  console.log('Загрузка документов...');
  const documents = await loadDocuments();
  console.log(`Загружено документов: ${documents.length}`);

  try {
    await chroma.deleteCollection({ name: 'admission_docs' });
    console.log('Старая коллекция удалена');
  } catch (err) {
    console.log('Старой коллекции не было — создаём заново');
  }

  const collection = await chroma.getOrCreateCollection({ name: 'admission_docs' });

  let totalChunks = 0;

  for (const doc of documents) {
    const chunks = splitIntoChunks(doc.text);
    console.log(`${doc.source}: ${chunks.length} чанков`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      const id = `${doc.source}_${i}`;

      await collection.add({
        ids: [id],
        embeddings: [embedding],
        documents: [chunk],
        metadatas: [{ source: doc.source }],
      });

      totalChunks++;
      process.stdout.write(`\rОбработано чанков: ${totalChunks}`);
    }
  }

  console.log(`\n\nГотово! Всего проиндексировано чанков: ${totalChunks}`);
}

buildIndex();