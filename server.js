const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();
const OpenAI = require('openai');
const { ChromaClient } = require('chromadb');
const { listDocuments, listTrash, addDocument, removeDocument, restoreDocument } = require('./knowledgeBase');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const upload = multer(); // храним файл в памяти, не на диске напрямую

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: 'http://localhost:8000' });

// Храним историю диалогов в памяти, по session_id
const sessions = {};

function getHistory(sessionId) {
  if (!sessions[sessionId]) sessions[sessionId] = [];
  return sessions[sessionId];
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// Переформулировка вопроса с учётом истории диалога
async function rewriteQuery(history, userMessage) {
  if (history.length === 0) return userMessage;

  const historyText = history
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content:
          'На основе истории диалога переформулируй последний вопрос пользователя ' +
          'так, чтобы он был понятен без контекста. Если вопрос уже самостоятелен, ' +
          'верни его без изменений. Ответь только переформулированным вопросом, без пояснений.\n\n' +
          `История:\n${historyText}\n\nВопрос: ${userMessage}`,
      },
    ],
    max_tokens: 100,
  });

  return response.choices[0].message.content.trim();
}

// Поиск релевантных чанков в Chroma
async function searchKnowledgeBase(query, topK = 8) {
  const collection = await chroma.getOrCreateCollection({ name: 'admission_docs' });
  const embedding = await getEmbedding(query);

  const results = await collection.query({
    queryEmbeddings: [embedding],
    nResults: topK,
  });

  return results.documents[0];
}

// Генерация итогового ответа
async function generateAnswer(history, userMessage, contextChunks) {
  const historyText = history
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const contextText = contextChunks.join('\n\n---\n\n');

  const systemPrompt =
    'Ты — консультант приёмной комиссии РТУ МИРЭА. Отвечай только на основе ' +
    'предоставленного контекста. Контекст может содержать несколько фрагментов, ' +
    'каждый из которых описывает свой конкретный объект (например, отдельное общежитие) ' +
    'или отдельную строку таблицы с точным значением для конкретной категории. ' +
    'Прежде чем отвечать, точно определи, к какому именно объекту, номеру или категории ' +
    'относится вопрос, и используй данные ТОЛЬКО из того фрагмента, который явно называет ' +
    'именно этот объект или категорию. Не объединяй и не переноси детали из фрагментов ' +
    'про другие объекты или категории, даже если они похожи по смыслу или находятся рядом ' +
    'в тексте. Если в контексте есть НЕСКОЛЬКО РАЗНЫХ образовательных программ или направлений ' +
    'подготовки с похожим или одинаковым названием (например, разные уровни — бакалавриат, ' +
    'специалитет, магистратура — или разные профили одного направления), НЕ объединяй их ' +
    'требования в один общий ответ. Вместо этого перечисли их отдельно, явно указав код ' +
    'направления, уровень подготовки и/или профиль для каждого, и что именно требуется по каждому. ' +
    'ОСОБОЕ ВНИМАНИЕ: при поступлении в вуз существует несколько РАЗНЫХ, официально ' +
    'различающихся видов квот и льгот — особая квота, отдельная квота, целевая квота — ' +
    'у каждой свой список категорий поступающих, и они регулируются разными нормами закона. ' +
    'Названия этих квот похожи, но относятся к разным категориям людей. Если пользователь ' +
    'спрашивает про какой-то один конкретный вид квоты (например, именно про отдельную квоту), ' +
    'используй информацию только про этот вид, а не про другой похожий по названию. Если в тексте ' +
    'явно не указано, к какому именно виду квоты относится найденный фрагмент, не утверждай ' +
    'уверенно, а уточни это или честно скажи, что не можешь точно определить. ' +
    'В извлечённых фрагментах текста таблиц могут встречаться порядковые номера строк ' +
    '(сквозная нумерация записей таблицы) — они НЕ являются баллами, оценками, количеством мест ' +
    'или любым другим значением показателя. Никогда не используй такой номер строки как ответ ' +
    'на вопрос о конкретном числовом значении. Если для конкретного профиля или категории точное ' +
    'числовое значение (балл, сумма, количество) не встречается явно в тексте контекста рядом ' +
    'с названием соответствующего предмета или показателя, не пытайся угадать или подставить ' +
    'похожее число — вместо этого честно скажи, что не располагаешь точным значением по этому пункту. ' +
    'Если в контексте нет фрагмента, явно относящегося именно к запрошенному объекту, честно ' +
    'скажи, что не располагаешь точной информацией по нему. Если ответа нет в контексте вообще, ' +
    'кратко и честно скажи об этом. Не добавляй общих фраз-рекомендаций вроде совета обратиться ' +
    'в приёмную комиссию.';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `История диалога:\n${historyText}\n\nКонтекст:\n${contextText}\n\nВопрос: ${userMessage}`,
      },
    ],
  });

  return response.choices[0].message.content;
}

// Простая защита паролем через заголовок
function checkAdminPassword(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  next();
}

app.get('/', (req, res) => {
  res.send('Сервер работает!');
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Нужны sessionId и message' });
    }

    const history = getHistory(sessionId);

    const searchQuery = await rewriteQuery(history, message);
    const contextChunks = await searchKnowledgeBase(searchQuery);
    const answer = await generateAnswer(history, message, contextChunks);

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: answer });

    res.json({ answer, searchQuery, debugChunks: contextChunks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/documents', checkAdminPassword, (req, res) => {
  res.json({ documents: listDocuments() });
});

app.post('/api/admin/upload', checkAdminPassword, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
    const chunksCount = await addDocument(req.file.originalname, req.file.buffer);
    res.json({ success: true, filename: req.file.originalname, chunksCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/documents/:filename', checkAdminPassword, async (req, res) => {
  try {
    await removeDocument(req.params.filename);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/admin/trash', checkAdminPassword, (req, res) => {
  res.json({ trash: listTrash() });
});

app.post('/api/admin/trash/:trashName/restore', checkAdminPassword, async (req, res) => {
  try {
    const result = await restoreDocument(req.params.trashName);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});