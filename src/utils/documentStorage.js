const API_BASE = "/api/data";
const LEGACY_DATABASE_NAME = "vocaread-documents";
const LEGACY_DATABASE_VERSION = 2;
const LEGACY_STORES = [
  "documents",
  "studyIndexes",
  "studyChunks",
  "assessments",
  "assessmentAttempts",
];

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error("Could not reach VocaRead cloud storage. Check the backend connection.", {
      cause: error,
    });
  }

  const body = await response.text();
  let data = {};
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`VocaRead storage returned an invalid response (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Storage request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const jsonBody = (value) => JSON.stringify(value);
const documentPath = (id) => `/documents/${encodeURIComponent(id)}`;
const indexPath = (id) => `/study-index/${encodeURIComponent(id)}`;
const assessmentPath = (id) => `/assessments/${encodeURIComponent(id)}`;

export async function listDocuments() {
  const data = await request("/documents");
  return data.documents || [];
}

export async function getDocument(id) {
  try {
    const data = await request(documentPath(id));
    return data.document || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function saveDocument(documentRecord) {
  const name = documentRecord?.name?.trim();
  if (!documentRecord?.id) {
    throw new Error("A document ID is required to save.");
  }
  if (!name) throw new Error("A document name is required to save.");
  if (!(documentRecord.sourceText || "").trim() && !(documentRecord.structuredMarkdown || "").trim()) {
    throw new Error("There is no document content to save.");
  }
  const data = await request("/documents", {
    method: "POST",
    body: jsonBody({ ...documentRecord, name }),
  });
  return data.document;
}

export async function renameDocument(id, name) {
  const data = await request(documentPath(id), {
    method: "PATCH",
    body: jsonBody({ name }),
  });
  return data.document;
}

export async function deleteDocument(id) {
  await request(documentPath(id), { method: "DELETE" });
  return true;
}

export async function markDocumentOpened(id) {
  const data = await request(documentPath(id), {
    method: "PATCH",
    body: jsonBody({ lastOpenedAt: new Date().toISOString() }),
  });
  return data.document;
}

export async function updateReadingProgress(id, progress) {
  const sentenceCount = Math.max(0, Math.floor(Number(progress.sentenceCount) || 0));
  const currentSentenceIndex = sentenceCount
    ? Math.min(Math.max(0, Math.floor(Number(progress.currentSentenceIndex) || 0)), sentenceCount - 1)
    : 0;
  const data = await request(documentPath(id), {
    method: "PATCH",
    body: jsonBody({
      currentSentenceIndex,
      sentenceCount,
      readingSpeed: Math.min(2, Math.max(0.75, Number(progress.readingSpeed) || 1)),
      readingProgress: Math.min(100, Math.max(0, Number(progress.readingProgress) || 0)),
      isCompleted: Boolean(progress.isCompleted),
    }),
  });
  return data.document;
}

export async function getStudyIndex(documentId) {
  return request(indexPath(documentId));
}

export async function setStudyIndexStatus(documentId, status, details = {}) {
  const data = await request(indexPath(documentId), {
    method: "PATCH",
    body: jsonBody({ ...details, status }),
  });
  return data.metadata;
}

export async function replaceStudyIndex(documentId, metadata, chunks) {
  const data = await request(indexPath(documentId), {
    method: "PUT",
    body: jsonBody({ metadata, chunks }),
  });
  return data.metadata;
}

export async function deleteStudyIndex(documentId) {
  await request(indexPath(documentId), { method: "DELETE" });
  return true;
}

export async function saveAssessment(assessment) {
  if (!assessment?.id || !assessment?.documentId || !assessment.questions?.length) {
    throw new Error("Assessment data is incomplete.");
  }
  const data = await request("/assessments", {
    method: "POST",
    body: jsonBody(assessment),
  });
  return data.assessment;
}

export async function listAssessments() {
  const data = await request("/assessments");
  return data.assessments || [];
}

export async function getAssessment(id) {
  try {
    const data = await request(assessmentPath(id));
    return data.assessment || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function deleteAssessment(id) {
  await request(assessmentPath(id), { method: "DELETE" });
  return true;
}

export async function saveAssessmentAttempt(attempt) {
  if (!attempt?.id || !attempt?.assessmentId) {
    throw new Error("Attempt data is incomplete.");
  }
  const data = await request(`${assessmentPath(attempt.assessmentId)}/attempts`, {
    method: "POST",
    body: jsonBody(attempt),
  });
  return data.attempt;
}

export async function listAssessmentAttempts(assessmentId) {
  const data = await request(`${assessmentPath(assessmentId)}/attempts`);
  return data.attempts || [];
}

function openLegacyDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(LEGACY_DATABASE_NAME, LEGACY_DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains("documents")) {
        const store = database.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("lastOpenedAt", "lastOpenedAt");
      }
      if (!database.objectStoreNames.contains("studyIndexes")) {
        database.createObjectStore("studyIndexes", { keyPath: "documentId" });
      }
      if (!database.objectStoreNames.contains("studyChunks")) {
        const store = database.createObjectStore("studyChunks", { keyPath: "id" });
        store.createIndex("documentId", "documentId");
      }
      if (!database.objectStoreNames.contains("assessments")) {
        const store = database.createObjectStore("assessments", { keyPath: "id" });
        store.createIndex("documentId", "documentId");
      }
      if (!database.objectStoreNames.contains("assessmentAttempts")) {
        const store = database.createObjectStore("assessmentAttempts", { keyPath: "id" });
        store.createIndex("assessmentId", "assessmentId");
      }
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error || new Error("Could not read the previous browser library."));
    openRequest.onblocked = () => reject(new Error("Close other VocaRead tabs to move your saved library."));
  });
}

async function readLegacyData() {
  const database = await openLegacyDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LEGACY_STORES, "readonly");
    const result = {};
    for (const name of LEGACY_STORES) {
      const store = transaction.objectStore(name);
      const getAll = store.getAll();
      getAll.onsuccess = () => { result[name] = getAll.result || []; };
    }
    transaction.oncomplete = () => {
      database.close();
      const chunksByDocument = new Map();
      for (const chunk of result.studyChunks || []) {
        const chunks = chunksByDocument.get(chunk.documentId) || [];
        chunks.push(chunk);
        chunksByDocument.set(chunk.documentId, chunks);
      }
      const metadataByDocument = new Map(
        (result.studyIndexes || []).map((metadata) => [metadata.documentId, metadata]),
      );
      const documentIds = new Set([
        ...metadataByDocument.keys(),
        ...chunksByDocument.keys(),
      ]);
      resolve({
        documents: result.documents || [],
        studyIndexes: [...documentIds].map((documentId) => ({
          documentId,
          metadata: metadataByDocument.get(documentId) || null,
          chunks: chunksByDocument.get(documentId) || [],
        })),
        assessments: result.assessments || [],
        assessmentAttempts: result.assessmentAttempts || [],
      });
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Could not read the previous browser library."));
    };
  });
}

async function clearLegacyData() {
  const database = await openLegacyDatabase();
  if (!database) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(LEGACY_STORES, "readwrite");
    for (const name of LEGACY_STORES) transaction.objectStore(name).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not finish moving the previous browser library."));
    transaction.onabort = () => reject(transaction.error || new Error("The previous browser library could not be cleared."));
  });
  database.close();
}

export async function migrateLegacyBrowserData() {
  const legacy = await readLegacyData();
  if (!legacy) return { migrated: 0 };
  const hasRecords = Object.values(legacy).some((records) => records.length > 0);
  if (!hasRecords) return { migrated: 0 };

  for (const [category, records] of Object.entries(legacy)) {
    let batch = [];
    let batchSize = 0;
    for (const record of records) {
      const recordSize = JSON.stringify(record).length;
      if (batch.length && (batch.length >= 20 || batchSize + recordSize > 5_000_000)) {
        const result = await request("/import", {
          method: "POST",
          body: jsonBody({ [category]: batch }),
        });
        if (result.imported?.[category] !== batch.length) {
          throw new Error(`Some previous ${category} records could not be moved.`);
        }
        batch = [];
        batchSize = 0;
      }
      batch.push(record);
      batchSize += recordSize;
    }
    if (batch.length) {
      const result = await request("/import", {
        method: "POST",
        body: jsonBody({ [category]: batch }),
      });
      if (result.imported?.[category] !== batch.length) {
        throw new Error(`Some previous ${category} records could not be moved.`);
      }
    }
  }
  const count = Object.values(legacy).reduce((total, records) => total + records.length, 0);
  await clearLegacyData();
  return { migrated: count };
}
