const DATABASE_NAME = "vocaread-documents";
const DATABASE_VERSION = 2;
const STORE_NAME = "documents";
const INDEX_STORE = "studyIndexes";
const CHUNK_STORE = "studyChunks";
const ASSESSMENT_STORE = "assessments";
const ATTEMPT_STORE = "assessmentAttempts";

let databasePromise;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Document storage is unavailable in this browser."),
    );
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("lastOpenedAt", "lastOpenedAt");
      }

      if (!database.objectStoreNames.contains(INDEX_STORE)) {
        database.createObjectStore(INDEX_STORE, { keyPath: "documentId" });
      }

      if (!database.objectStoreNames.contains(CHUNK_STORE)) {
        const store = database.createObjectStore(CHUNK_STORE, { keyPath: "id" });
        store.createIndex("documentId", "documentId");
      }

      if (!database.objectStoreNames.contains(ASSESSMENT_STORE)) {
        const store = database.createObjectStore(ASSESSMENT_STORE, {
          keyPath: "id",
        });
        store.createIndex("documentId", "documentId");
      }

      if (!database.objectStoreNames.contains(ATTEMPT_STORE)) {
        const store = database.createObjectStore(ATTEMPT_STORE, { keyPath: "id" });
        store.createIndex("assessmentId", "assessmentId");
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error("Could not open document storage."));
    };

    request.onblocked = () => {
      databasePromise = undefined;
      reject(
        new Error("Document storage is blocked by another open VocaRead tab."),
      );
    };
  });

  return databasePromise;
}

async function runTransaction(mode, operation, storeName = STORE_NAME) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let operationError;

    try {
      transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => {
        reject(
          operationError ||
            transaction.error ||
            new Error("Document storage transaction failed."),
        );
      };
      transaction.onabort = () => {
        reject(
          operationError ||
            transaction.error ||
            new Error("Document storage transaction was interrupted."),
        );
      };

      operation(store, {
        setResult(value) {
          result = value;
        },
        fail(error) {
          operationError = error;
          transaction.abort();
        },
      });
    } catch (error) {
      if (transaction) {
        operationError = error;
        transaction.abort();
      } else {
        reject(error);
      }
    }
  });
}

async function runMultiTransaction(storeNames, mode, operation) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let operationError;

    try {
      transaction = database.transaction(storeNames, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => {
        reject(
          operationError ||
            transaction.error ||
            new Error("Document study storage transaction failed."),
        );
      };
      transaction.onabort = () => {
        reject(
          operationError ||
            transaction.error ||
            new Error("Document study storage transaction was interrupted."),
        );
      };

      operation(
        Object.fromEntries(
          storeNames.map((name) => [name, transaction.objectStore(name)]),
        ),
        {
          setResult(value) {
            result = value;
          },
          fail(error) {
            operationError = error;
            transaction.abort();
          },
        },
      );
    } catch (error) {
      if (transaction) {
        operationError = error;
        transaction.abort();
      } else {
        reject(error);
      }
    }
  });
}

function updateRecord(id, updates, missingMessage) {
  return runTransaction("readwrite", (store, controls) => {
    const request = store.get(id);

    request.onsuccess = () => {
      if (!request.result) {
        controls.fail(new Error(missingMessage));
        return;
      }

      const updatedRecord = {
        ...request.result,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      const updateRequest = store.put(updatedRecord);
      updateRequest.onsuccess = () => controls.setResult(updatedRecord);
    };
  });
}

export function listDocuments() {
  return runTransaction("readonly", (store, controls) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const documents = request.result || [];
      documents.sort((first, second) => {
        const firstDate = first.lastOpenedAt || first.updatedAt || "";
        const secondDate = second.lastOpenedAt || second.updatedAt || "";
        return secondDate.localeCompare(firstDate);
      });
      controls.setResult(documents);
    };
  });
}

export function getDocument(id) {
  return runTransaction("readonly", (store, controls) => {
    const request = store.get(id);
    request.onsuccess = () => controls.setResult(request.result || null);
  });
}

export function saveDocument(documentRecord) {
  const name = documentRecord?.name?.trim();
  const sourceText = documentRecord?.sourceText || "";
  const structuredMarkdown = documentRecord?.structuredMarkdown || "";

  if (!documentRecord?.id) {
    return Promise.reject(new Error("A document ID is required to save."));
  }

  if (!name) {
    return Promise.reject(new Error("A document name is required to save."));
  }

  if (!sourceText.trim() && !structuredMarkdown.trim()) {
    return Promise.reject(new Error("There is no document content to save."));
  }

  return runTransaction("readwrite", (store, controls) => {
    const request = store.get(documentRecord.id);

    request.onsuccess = () => {
      const existing = request.result;
      const now = new Date().toISOString();
      const savedRecord = {
        ...existing,
        ...documentRecord,
        id: documentRecord.id,
        name,
        sourceText,
        structuredMarkdown,
        createdAt: existing?.createdAt || documentRecord.createdAt || now,
        updatedAt: now,
      };
      const saveRequest = store.put(savedRecord);
      saveRequest.onsuccess = () => controls.setResult(savedRecord);
    };
  });
}

export function renameDocument(id, name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";

  if (!normalizedName) {
    return Promise.reject(new Error("A document name cannot be empty."));
  }

  return updateRecord(
    id,
    { name: normalizedName },
    "The saved document could not be found.",
  );
}

export function deleteDocument(id) {
  return runTransaction("readwrite", (store, controls) => {
    const request = store.get(id);

    request.onsuccess = () => {
      if (!request.result) {
        controls.fail(new Error("The saved document could not be found."));
        return;
      }

      const deleteRequest = store.delete(id);
      deleteRequest.onsuccess = () => controls.setResult(true);
    };
  });
}

export function markDocumentOpened(id) {
  return updateRecord(
    id,
    { lastOpenedAt: new Date().toISOString() },
    "The saved document could not be found.",
  );
}

export function updateReadingProgress(id, progress) {
  const sentenceCount = Math.max(0, Math.floor(Number(progress.sentenceCount) || 0));
  const requestedIndex = Math.max(
    0,
    Math.floor(Number(progress.currentSentenceIndex) || 0),
  );
  const currentSentenceIndex =
    sentenceCount > 0 ? Math.min(requestedIndex, sentenceCount - 1) : 0;
  const readingSpeed = Math.min(
    2,
    Math.max(0.75, Number(progress.readingSpeed) || 1),
  );
  const readingProgress = Math.min(
    100,
    Math.max(0, Number(progress.readingProgress) || 0),
  );

  return updateRecord(
    id,
    {
      currentSentenceIndex,
      sentenceCount,
      readingSpeed,
      readingProgress,
      isCompleted: Boolean(progress.isCompleted),
    },
    "The saved document could not be found while updating progress.",
  );
}

export function getStudyIndex(documentId) {
  return runMultiTransaction(
    [INDEX_STORE, CHUNK_STORE],
    "readonly",
    (stores, controls) => {
      const metadataRequest = stores[INDEX_STORE].get(documentId);
      const chunksRequest = stores[CHUNK_STORE]
        .index("documentId")
        .getAll(documentId);
      let metadata;
      let chunks;

      metadataRequest.onsuccess = () => {
        metadata = metadataRequest.result || null;
        if (chunks !== undefined) {
          controls.setResult({ metadata, chunks });
        }
      };
      chunksRequest.onsuccess = () => {
        chunks = chunksRequest.result || [];
        if (metadata !== undefined) {
          controls.setResult({ metadata, chunks });
        }
      };
    },
  );
}

export function setStudyIndexStatus(documentId, status, details = {}) {
  return runTransaction("readwrite", (store, controls) => {
    const request = store.get(documentId);
    request.onsuccess = () => {
      const metadata = {
        ...(request.result || {}),
        ...details,
        documentId,
        status,
        updatedAt: new Date().toISOString(),
      };
      const saveRequest = store.put(metadata);
      saveRequest.onsuccess = () => controls.setResult(metadata);
    };
  }, INDEX_STORE);
}

export function replaceStudyIndex(documentId, metadata, chunks) {
  return runMultiTransaction(
    [INDEX_STORE, CHUNK_STORE],
    "readwrite",
    (stores, controls) => {
      const chunksIndex = stores[CHUNK_STORE].index("documentId");
      const existingRequest = chunksIndex.getAll(documentId);
      existingRequest.onsuccess = () => {
        for (const existing of existingRequest.result || []) {
          stores[CHUNK_STORE].delete(existing.id);
        }

        for (const chunk of chunks) {
          stores[CHUNK_STORE].put({ ...chunk, documentId });
        }

        const nextMetadata = {
          ...metadata,
          documentId,
          status: "ready",
          updatedAt: new Date().toISOString(),
        };
        const metadataRequest = stores[INDEX_STORE].put(nextMetadata);
        metadataRequest.onsuccess = () => controls.setResult(nextMetadata);
      };
    },
  );
}

export function deleteStudyIndex(documentId) {
  return runMultiTransaction(
    [INDEX_STORE, CHUNK_STORE],
    "readwrite",
    (stores, controls) => {
      const existingRequest = stores[CHUNK_STORE]
        .index("documentId")
        .getAll(documentId);
      existingRequest.onsuccess = () => {
        for (const chunk of existingRequest.result || []) {
          stores[CHUNK_STORE].delete(chunk.id);
        }
        stores[INDEX_STORE].delete(documentId);
        controls.setResult(true);
      };
    },
  );
}

export function saveAssessment(assessment) {
  if (!assessment?.id || !assessment?.documentId || !assessment.questions?.length) {
    return Promise.reject(new Error("Assessment data is incomplete."));
  }

  return runTransaction("readwrite", (store, controls) => {
    const request = store.put(assessment);
    request.onsuccess = () => controls.setResult(assessment);
  }, ASSESSMENT_STORE);
}

export function listAssessments() {
  return runTransaction("readonly", (store, controls) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const assessments = request.result || [];
      assessments.sort((first, second) =>
        (second.createdAt || "").localeCompare(first.createdAt || ""),
      );
      controls.setResult(assessments);
    };
  }, ASSESSMENT_STORE);
}

export function getAssessment(id) {
  return runTransaction("readonly", (store, controls) => {
    const request = store.get(id);
    request.onsuccess = () => controls.setResult(request.result || null);
  }, ASSESSMENT_STORE);
}

export function deleteAssessment(id) {
  return runMultiTransaction(
    [ASSESSMENT_STORE, ATTEMPT_STORE],
    "readwrite",
    (stores, controls) => {
      const assessmentRequest = stores[ASSESSMENT_STORE].get(id);
      assessmentRequest.onsuccess = () => {
        if (!assessmentRequest.result) {
          controls.fail(new Error("The saved assessment could not be found."));
          return;
        }

        const attemptsRequest = stores[ATTEMPT_STORE]
          .index("assessmentId")
          .getAll(id);
        attemptsRequest.onsuccess = () => {
          for (const attempt of attemptsRequest.result || []) {
            stores[ATTEMPT_STORE].delete(attempt.id);
          }
          stores[ASSESSMENT_STORE].delete(id);
          controls.setResult(true);
        };
      };
    },
  );
}

export function saveAssessmentAttempt(attempt) {
  if (!attempt?.id || !attempt?.assessmentId) {
    return Promise.reject(new Error("Attempt data is incomplete."));
  }

  return runTransaction("readwrite", (store, controls) => {
    const request = store.put(attempt);
    request.onsuccess = () => controls.setResult(attempt);
  }, ATTEMPT_STORE);
}

export function listAssessmentAttempts(assessmentId) {
  return runTransaction("readonly", (store, controls) => {
    const request = store.index("assessmentId").getAll(assessmentId);
    request.onsuccess = () => {
      const attempts = request.result || [];
      attempts.sort((first, second) =>
        (second.submittedAt || "").localeCompare(first.submittedAt || ""),
      );
      controls.setResult(attempts);
    };
  }, ATTEMPT_STORE);
}
