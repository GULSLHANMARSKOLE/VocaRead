import { useEffect, useRef, useState } from "react";
import AssessmentResults from "../components/AssessmentResults";
import {
  deleteAssessment,
  getAssessment,
  getDocument,
  getStudyIndex,
  listAssessmentAttempts,
  listAssessments,
  replaceStudyIndex,
  saveAssessment,
  setStudyIndexStatus,
} from "../utils/documentStorage";
import { chunkDocument, hashDocumentContent } from "../utils/documentChunking";
import {
  askStudyQuestion,
  embedStudyChunks,
  embedStudyQuestion,
  generateStudyAssessment,
  getStudyConfig,
} from "../utils/studyApi";

const EMBEDDING_BATCH_SIZE = 16;
const MAX_RETRIEVED_CHUNKS = 5;
const MINIMUM_RETRIEVAL_SCORE = 0.2;

function cosineSimilarity(first, second) {
  if (
    !Array.isArray(first) ||
    !Array.isArray(second) ||
    first.length !== second.length
  ) {
    return -1;
  }

  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }

  const denominator = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  return denominator > 0 ? dot / denominator : -1;
}

function sourceLabel(source, chunkIndex) {
  if (source?.section) {
    return `Section: ${source.section}`;
  }
  if (Number.isInteger(source?.pageNumber)) {
    return `Page ${source.pageNumber}`;
  }
  return `Passage ${Number(source?.passageNumber) || chunkIndex + 1}`;
}

function sampleChunksForAssessment(chunks, maximum = 24) {
  const ordered = [...chunks].sort(
    (first, second) => first.chunkIndex - second.chunkIndex,
  );
  if (ordered.length <= maximum) {
    return ordered;
  }

  const chosen = new Map();
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.floor(
      (index * (ordered.length - 1)) / (maximum - 1),
    );
    chosen.set(ordered[sourceIndex].id, ordered[sourceIndex]);
  }
  return [...chosen.values()];
}

function validAssessmentQuestions(questions, suppliedChunks) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  const chunkMap = new Map(suppliedChunks.map((chunk) => [chunk.id, chunk]));
  const seen = new Set();
  const valid = [];

  for (const question of questions) {
    if (
      typeof question?.question !== "string" ||
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      typeof question.correctOptionId !== "string" ||
      !Array.isArray(question.sourceChunkIds) ||
      !question.sourceChunkIds.length ||
      typeof question.evidenceQuote !== "string"
    ) {
      continue;
    }

    const optionsAreWellFormed = question.options.every(
      (option) =>
        option &&
        typeof option.id === "string" &&
        option.id.trim().length > 0 &&
        typeof option.text === "string" &&
        option.text.trim().length > 0,
    );

    if (!optionsAreWellFormed) {
      continue;
    }

    const optionIds = new Set(
      question.options.map((option) => option.id.trim()),
    );

    const optionTexts = new Set(
      question.options.map((option) => option.text.trim().toLowerCase()),
    );

    if (
      optionIds.size !== 4 ||
      optionTexts.size !== 4 ||
      !optionIds.has(question.correctOptionId.trim())
    ) {
      continue;
    }
    const sourceChunks = question.sourceChunkIds.map((id) => chunkMap.get(id));
    const quote = question.evidenceQuote
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const quoteSupported = sourceChunks.some((chunk) =>
      chunk?.text.toLowerCase().replace(/\s+/g, " ").includes(quote),
    );
    const questionKey = question.question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (
      optionIds.size !== 4 ||
      optionTexts.size !== 4 ||
      !optionIds.has(question.correctOptionId) ||
      sourceChunks.some((chunk) => !chunk) ||
      !quoteSupported ||
      seen.has(questionKey)
    ) {
      continue;
    }

    seen.add(questionKey);
    valid.push({
      ...question,
      sourceLabels: sourceChunks.map((chunk) =>
        sourceLabel(chunk.source, chunk.chunkIndex),
      ),
    });
  }

  return valid;
}

function StudyWorkspace({
  documentId,
  savedDocuments,
  initialTab = "ask",
  onOpenDocument,
  onGoHome,
  onNavigationTargetChange,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [documentRecord, setDocumentRecord] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [indexState, setIndexState] = useState({
    status: "idle",
    completed: 0,
    total: 0,
    error: "",
  });
  const [indexRevision, setIndexRevision] = useState(0);
  const [messages, setMessages] = useState([]);
  const [messagesDocumentId, setMessagesDocumentId] = useState(null);
  const [questionInput, setQuestionInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [latestAttempts, setLatestAttempts] = useState({});
  const [assessmentError, setAssessmentError] = useState("");
  const [assessmentToDelete, setAssessmentToDelete] = useState(null);
  const [attemptLoadError, setAttemptLoadError] = useState("");
  const openedFromSavedAssessmentsRef = useRef(false);

  const indexRequestRef = useRef(0);
  const chatRequestRef = useRef(0);
  const chatAbortRef = useRef(null);
  const generationAbortRef = useRef(null);
  const indexAbortRef = useRef(null);
  const indexedChunksRef = useRef([]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    setAssessment(null);
    setReviewAttempt(null);
    openedFromSavedAssessmentsRef.current = false;
    onNavigationTargetChange?.(tab === "assessments" ? "assessments" : "workspace");
  };

  useEffect(() => {
    let mounted = true;
    listAssessments()
      .then(async (items) => {
        if (!mounted) return;
        setAssessments(items);
        const attemptEntries = await Promise.all(
          items.map(async (item) => [
            item.id,
            await listAssessmentAttempts(item.id),
          ]),
        );
        if (mounted) {
          setLatestAttempts(
            Object.fromEntries(
              attemptEntries.map(([id, attempts]) => [id, attempts[0] || null]),
            ),
          );
        }
      })
      .catch((error) => {
        if (mounted) {
          setAssessmentError(
            error.message || "Could not load saved assessments.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const requestId = ++indexRequestRef.current;
    const controller = new AbortController();
    indexAbortRef.current?.abort();
    indexAbortRef.current = controller;
    chatAbortRef.current?.abort();
    generationAbortRef.current?.abort();
    chatRequestRef.current += 1;
    indexedChunksRef.current = [];

    const initializeDocumentIndex = async () => {
      setDocumentRecord(null);
      setMessages([]);
      setMessagesDocumentId(null);
      setChatError("");
      setGenerationError("");
      setGenerationStatus("");
      setAssessment(null);
      setReviewAttempt(null);
      setLoadError("");
      setIndexState({
        status: documentId ? "loading" : "idle",
        completed: 0,
        total: 0,
        error: "",
      });

      if (!documentId) {
        return;
      }

      try {
        const [record, config] = await Promise.all([
          getDocument(documentId),
          getStudyConfig(controller.signal),
        ]);
        if (requestId !== indexRequestRef.current) return;
        if (!record) {
          throw new Error(
            "Choose a saved document to open its Study Workspace.",
          );
        }

        const sourceText =
          record.sourceText?.trim() || record.structuredMarkdown?.trim() || "";
        if (!sourceText) {
          throw new Error(
            "This saved document has no readable content to index.",
          );
        }
        const contentHash = await hashDocumentContent(sourceText);
        const existingIndex = await getStudyIndex(documentId);

        if (
          existingIndex.metadata?.status === "ready" &&
          existingIndex.metadata.contentHash === contentHash &&
          existingIndex.metadata.embeddingModel === config.embeddingModel &&
          existingIndex.metadata.embeddingDimensions ===
            config.embeddingDimensions &&
          existingIndex.chunks.length > 0 &&
          existingIndex.chunks.every(
            (chunk) => chunk.embedding?.length === config.embeddingDimensions,
          )
        ) {
          if (requestId !== indexRequestRef.current) return;
          setDocumentRecord({ ...record, studyText: sourceText });
          indexedChunksRef.current = existingIndex.chunks;
          setIndexState({
            status: "ready",
            completed: existingIndex.chunks.length,
            total: existingIndex.chunks.length,
            error: "",
            embeddingModel: config.embeddingModel,
          });
          return;
        }

        const rawChunks = chunkDocument(sourceText, documentId);
        if (!rawChunks.length) {
          throw new Error(
            "No searchable text passages could be created from this document.",
          );
        }

        setDocumentRecord({ ...record, studyText: sourceText });
        setIndexState({
          status: "indexing",
          completed: 0,
          total: rawChunks.length,
          error: "",
        });
        await setStudyIndexStatus(documentId, "indexing", {
          contentHash,
          embeddingModel: config.embeddingModel,
          embeddingDimensions: config.embeddingDimensions,
          chunkCount: rawChunks.length,
        });

        const indexedChunks = [];
        for (
          let offset = 0;
          offset < rawChunks.length;
          offset += EMBEDDING_BATCH_SIZE
        ) {
          if (
            requestId !== indexRequestRef.current ||
            controller.signal.aborted
          )
            return;
          const batch = rawChunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
          const result = await embedStudyChunks(batch, controller.signal);
          const embeddingMap = new Map(
            result.embeddings.map((embedding) => [
              embedding.id,
              embedding.values,
            ]),
          );
          if (
            result.embeddingModel !== config.embeddingModel ||
            result.embeddingDimensions !== config.embeddingDimensions ||
            batch.some(
              (chunk) =>
                embeddingMap.get(chunk.id)?.length !==
                config.embeddingDimensions,
            )
          ) {
            throw new Error(
              "The embedding response did not match the configured model or dimensions.",
            );
          }

          indexedChunks.push(
            ...batch.map((chunk) => ({
              ...chunk,
              embedding: embeddingMap.get(chunk.id),
            })),
          );
          setIndexState({
            status: "indexing",
            completed: indexedChunks.length,
            total: rawChunks.length,
            error: "",
          });
        }

        if (requestId !== indexRequestRef.current || controller.signal.aborted)
          return;
        await replaceStudyIndex(
          documentId,
          {
            contentHash,
            embeddingModel: config.embeddingModel,
            embeddingDimensions: config.embeddingDimensions,
            chunkCount: indexedChunks.length,
          },
          indexedChunks,
        );
        indexedChunksRef.current = indexedChunks;
        setIndexState({
          status: "ready",
          completed: indexedChunks.length,
          total: indexedChunks.length,
          error: "",
          embeddingModel: config.embeddingModel,
        });
      } catch (error) {
        if (
          error.name === "AbortError" ||
          requestId !== indexRequestRef.current
        )
          return;
        const message = error.message || "Could not index this document.";
        setIndexState({
          status: "failed",
          completed: 0,
          total: 0,
          error: message,
        });
        setLoadError(message);
        if (documentId) {
          setStudyIndexStatus(documentId, "failed", { error: message }).catch(
            () => undefined,
          );
        }
      }
    };

    Promise.resolve().then(initializeDocumentIndex);
    return () => controller.abort();
  }, [documentId, indexRevision]);

  const refreshAssessments = async () => {
    try {
      const items = await listAssessments();
      setAssessments(items);
      const attempts = await Promise.all(
        items.map(async (item) => [
          item.id,
          await listAssessmentAttempts(item.id),
        ]),
      );
      setLatestAttempts(
        Object.fromEntries(
          attempts.map(([id, records]) => [id, records[0] || null]),
        ),
      );
      setAssessmentError("");
    } catch (error) {
      setAssessmentError(
        error.message || "Could not refresh saved assessments.",
      );
    }
  };

  const askQuestion = async (event) => {
    event.preventDefault();
    const question = questionInput.trim();
    if (!question || isAsking || indexState.status !== "ready") return;

    const requestId = ++chatRequestRef.current;
    const controller = new AbortController();
    chatAbortRef.current?.abort();
    chatAbortRef.current = controller;
    const requestDocumentId = documentId;
    setMessagesDocumentId(requestDocumentId);
    setMessages((current) => [
      ...(messagesDocumentId === requestDocumentId ? current : []),
      {
        id: globalThis.crypto?.randomUUID?.() || `message-${Date.now()}`,
        role: "user",
        content: question,
      },
    ]);
    setQuestionInput("");
    setIsAsking(true);
    setChatError("");

    try {
      const query = await embedStudyQuestion(question, controller.signal);
      if (
        requestId !== chatRequestRef.current ||
        requestDocumentId !== documentId
      )
        return;

      // Cosine similarity ranks stored document vectors by semantic direction, not shared keywords.
      const ranked = indexedChunksRef.current
        .map((chunk) => ({
          ...chunk,
          score: cosineSimilarity(query.embedding, chunk.embedding),
        }))
        .filter((chunk) => chunk.score >= MINIMUM_RETRIEVAL_SCORE)
        .sort((first, second) => second.score - first.score);

      const retrieved = [];
      let contextLength = 0;
      for (const chunk of ranked) {
        if (retrieved.length >= MAX_RETRIEVED_CHUNKS) break;
        if (retrieved.some((item) => item.id === chunk.id)) continue;
        if (contextLength + chunk.text.length > 9000) continue;
        retrieved.push(chunk);
        contextLength += chunk.text.length;
      }

      const answer = await askStudyQuestion(
        question,
        retrieved.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          source: chunk.source,
          chunkIndex: chunk.chunkIndex,
          score: Math.max(0, Math.min(1, chunk.score)),
        })),
        controller.signal,
      );
      if (
        requestId !== chatRequestRef.current ||
        requestDocumentId !== documentId
      )
        return;

      setMessages((current) => [
        ...current.filter((item) => item.id !== `pending-${requestId}`),
        {
          id: globalThis.crypto?.randomUUID?.() || `answer-${Date.now()}`,
          role: "assistant",
          content: answer.answer,
          insufficientEvidence: answer.insufficientEvidence,
          citations: answer.citations || [],
        },
      ]);
    } catch (error) {
      if (error.name !== "AbortError" && requestId === chatRequestRef.current) {
        setChatError(error.message || "Could not answer this question.");
      }
    } finally {
      if (requestId === chatRequestRef.current) {
        setIsAsking(false);
        chatAbortRef.current = null;
      }
    }
  };

  const generateAssessment = async () => {
    if (isGenerating || indexState.status !== "ready" || !documentRecord)
      return;
    setIsGenerating(true);
    setGenerationStatus("Selecting document passages...");
    setGenerationError("");
    const controller = new AbortController();
    generationAbortRef.current?.abort();
    generationAbortRef.current = controller;

    try {
      const chunks = sampleChunksForAssessment(indexedChunksRef.current).map(
        (chunk) => ({
          id: chunk.id,
          text: chunk.text,
          source: chunk.source,
          chunkIndex: chunk.chunkIndex,
        }),
      );
      setGenerationStatus("Generating and validating questions...");
      const result = await generateStudyAssessment(
        { id: documentRecord.id, name: documentRecord.name },
        Number(questionCount),
        chunks,
        controller.signal,
      );
      if (!result.questions?.length) {
        setGenerationStatus("");
        setGenerationError(
          result.message ||
            "These passages could not support validated questions. Try another section or a smaller count.",
        );
        return;
      }

      const validQuestions = validAssessmentQuestions(result.questions, chunks);
      if (!validQuestions.length) {
        throw new Error(
          "No generated questions passed source-reference validation. Try again or select a smaller count.",
        );
      }

      const chunkLabels = new Map(
        chunks.map((chunk) => [
          chunk.id,
          sourceLabel(chunk.source, chunk.chunkIndex),
        ]),
      );
      const now = new Date().toISOString();
      const savedAssessment = {
        id: globalThis.crypto?.randomUUID?.() || `assessment-${Date.now()}`,
        documentId: documentRecord.id,
        documentName: documentRecord.name,
        title: `${documentRecord.name} · ${validQuestions.length} questions`,
        createdAt: now,
        requestedCount: Number(questionCount),
        questionCount: validQuestions.length,
        difficulty: "mixed",
        embeddingModel: indexState.embeddingModel || "gemini-embedding-001",
        questions: validQuestions.map((question) => ({
          ...question,
          sourceLabels: question.sourceChunkIds
            .map((id) => chunkLabels.get(id))
            .filter(Boolean),
        })),
      };
      await saveAssessment(savedAssessment);
      await refreshAssessments();
      setAssessment(savedAssessment);
      setReviewAttempt(null);
      setGenerationStatus("");
      setGenerationError(
        result.insufficientContent
          ? result.message ||
              `Only ${validQuestions.length} reliable questions were available.`
          : `Saved ${validQuestions.length} validated questions.`,
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        setGenerationError(
          error.message || "Could not generate this assessment.",
        );
      }
      setGenerationStatus("");
    } finally {
      setIsGenerating(false);
      generationAbortRef.current = null;
    }
  };

  const startSavedAssessment = async (item, attempt = null) => {
    try {
      const stored = await getAssessment(item.id);
      if (!stored) throw new Error("The assessment could not be found.");
      setAssessment(stored);
      setReviewAttempt(attempt);
      setAttemptLoadError("");
      openedFromSavedAssessmentsRef.current = true;
      setActiveTab("mcq");
      onNavigationTargetChange?.("assessments");
    } catch (error) {
      setAttemptLoadError(error.message || "Could not open this assessment.");
    }
  };

  const reviewLatestAttempt = async (item) => {
    try {
      const attempts = await listAssessmentAttempts(item.id);
      if (!attempts.length) {
        setAttemptLoadError("This assessment has no submitted attempts yet.");
        return;
      }
      await startSavedAssessment(item, attempts[0]);
    } catch (error) {
      setAttemptLoadError(error.message || "Could not load this attempt.");
    }
  };

  const removeAssessment = async (id) => {
    try {
      await deleteAssessment(id);
      setAssessmentToDelete(null);
      await refreshAssessments();
    } catch (error) {
      setAssessmentError(error.message || "Could not delete this assessment.");
    }
  };

  const visibleMessages = messagesDocumentId === documentId ? messages : [];

  return (
    <section
      className="study-workspace"
      aria-labelledby="study-workspace-title"
    >
      <div className="study-page-header">
        <div>
          <span className="study-eyebrow">Document-grounded learning</span>
          <h2 id="study-workspace-title">Study Workspace</h2>
        </div>
        <button type="button" onClick={onGoHome}>
          Back to reader
        </button>
      </div>

      <div className="study-document-bar">
        <label htmlFor="study-document-select">Active document</label>
        <select
          id="study-document-select"
          value={documentId || ""}
          onChange={(event) => {
            if (event.target.value) onOpenDocument(event.target.value);
          }}
        >
          <option value="">Select a saved document</option>
          {savedDocuments.map((document) => (
            <option value={document.id} key={document.id}>
              {document.name}
            </option>
          ))}
        </select>
        <span>
          {documentRecord?.originalFileName ||
            documentRecord?.fileType ||
            "Saved to your account"}
        </span>
      </div>

      <div
        className="study-tabs"
        role="tablist"
        aria-label="Study workspace sections"
      >
        {[
          ["ask", "Ask Your Document"],
          ["mcq", "Generate MCQs"],
          ["assessments", "Saved Assessments"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => selectTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <p className="study-error" role="alert">
          {loadError}
        </p>
      )}

      {!documentId && activeTab !== "assessments" && !assessment ? (
        <div className="study-empty-state">
          <h3>Choose a document to study</h3>
          <p>
            Save a document in the reader, then select it here. Its searchable
            index is saved to your account.
          </p>
          {savedDocuments.length === 0 && (
            <button type="button" onClick={onGoHome}>
              Return to reader
            </button>
          )}
        </div>
      ) : (
        <>
          {documentId && (
            <div
              className={`study-index-status status-${indexState.status}`}
              role="status"
              aria-live="polite"
            >
              {indexState.status === "loading" &&
                "Loading saved document and index..."}
              {indexState.status === "indexing" && (
                <>
                  Indexing document passages: {indexState.completed} of{" "}
                  {indexState.total}
                  <progress
                    value={indexState.completed}
                    max={Math.max(1, indexState.total)}
                  />
                </>
              )}
              {indexState.status === "ready" &&
                `Search index ready · ${indexState.total} passages`}
              {indexState.status === "failed" && (
                <>
                  Indexing failed: {indexState.error}
                  <button
                    type="button"
                    onClick={() => setIndexRevision((revision) => revision + 1)}
                  >
                    Retry indexing
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === "ask" && !assessment && (
            <div className="study-chat-panel">
              <div className="study-chat-heading">
                <div>
                  <h3>Ask Your Document</h3>
                  <p>
                    Answers use the passages retrieved for each question, not an
                    automatic full-document prompt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setMessagesDocumentId(documentId);
                    setChatError("");
                  }}
                  disabled={!visibleMessages.length || isAsking}
                >
                  New conversation
                </button>
              </div>
              <div className="study-chat-messages" aria-live="polite">
                {visibleMessages.length === 0 && (
                  <p className="study-empty-copy">
                    Ask about a definition, concept, relationship, process, or
                    section in this document.
                  </p>
                )}
                {visibleMessages.map((message) => (
                  <article
                    className={`study-message ${message.role}`}
                    key={message.id}
                  >
                    <span className="study-message-role">
                      {message.role === "assistant" ? "VocaRead" : "You"}
                    </span>
                    <p>{message.content}</p>
                    {message.insufficientEvidence && (
                      <small>Not established by the retrieved passages.</small>
                    )}
                    {message.citations?.map((citation) => (
                      <details className="study-citation" key={citation.id}>
                        <summary>
                          {sourceLabel(citation.source, citation.chunkIndex)} ·
                          similarity {citation.score.toFixed(2)}
                        </summary>
                        <p>{citation.text}</p>
                      </details>
                    ))}
                  </article>
                ))}
                {isAsking && (
                  <p className="study-loading" role="status">
                    Retrieving relevant passages and preparing an answer...
                  </p>
                )}
              </div>
              {chatError && (
                <p className="study-error" role="alert">
                  {chatError}
                </p>
              )}
              <form className="study-question-form" onSubmit={askQuestion}>
                <label htmlFor="study-question">Your question</label>
                <textarea
                  id="study-question"
                  value={questionInput}
                  onChange={(event) => setQuestionInput(event.target.value)}
                  placeholder="Ask something this document explains..."
                  maxLength={2000}
                  disabled={isAsking || indexState.status !== "ready"}
                />
                <button
                  type="submit"
                  disabled={
                    isAsking ||
                    indexState.status !== "ready" ||
                    !questionInput.trim()
                  }
                >
                  {isAsking ? "Searching..." : "Send question"}
                </button>
              </form>
            </div>
          )}

          {activeTab === "mcq" && !assessment && (
            <div className="study-mcq-panel">
              <h3>Generate MCQs</h3>
              <p>
                Questions are built from a sample of indexed passages and
                include source quotes. Unsupported questions are rejected.
              </p>
              <label htmlFor="study-question-count">Number of questions</label>
              <select
                id="study-question-count"
                value={questionCount}
                onChange={(event) =>
                  setQuestionCount(Number(event.target.value))
                }
                disabled={isGenerating || indexState.status !== "ready"}
              >
                {[5, 10, 15, 20].map((count) => (
                  <option key={count} value={count}>
                    {count} questions
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={generateAssessment}
                disabled={isGenerating || indexState.status !== "ready"}
              >
                {isGenerating
                  ? "Generating..."
                  : "Generate document-only assessment"}
              </button>
              {generationStatus && (
                <p className="study-loading" role="status">
                  {generationStatus}
                </p>
              )}
              {generationError && (
                <p
                  className={assessment ? "study-notice" : "study-error"}
                  role={assessment ? "status" : "alert"}
                >
                  {generationError}
                </p>
              )}
            </div>
          )}

          {activeTab === "mcq" && assessment && (
            <AssessmentResults
              key={`${assessment.id}-${reviewAttempt?.id || "new"}`}
              assessment={assessment}
              reviewAttempt={reviewAttempt}
              onClose={() => {
                setAssessment(null);
                setReviewAttempt(null);
                if (openedFromSavedAssessmentsRef.current) {
                  openedFromSavedAssessmentsRef.current = false;
                  setActiveTab("assessments");
                  onNavigationTargetChange?.("assessments");
                }
              }}
              onAttemptSaved={refreshAssessments}
            />
          )}

          {activeTab === "assessments" && (
            <div className="saved-assessments-panel">
              <div className="study-section-heading">
                <div>
                  <h3>Saved Assessments</h3>
                  <p>
                    Assessment questions and submitted attempts are stored
                    to your VocaRead account.
                  </p>
                </div>
                <button type="button" onClick={refreshAssessments}>
                  Refresh
                </button>
              </div>
              {assessmentError && (
                <p className="study-error" role="alert">
                  {assessmentError}
                </p>
              )}
              {attemptLoadError && (
                <p className="study-error" role="alert">
                  {attemptLoadError}
                </p>
              )}
              {!assessments.length && !assessmentError && (
                <p className="study-empty-copy">
                  No saved assessments yet. Generate one from an indexed
                  document.
                </p>
              )}
              <div className="saved-assessment-list">
                {assessments.map((item) => {
                  const latest = latestAttempts[item.id];
                  return (
                    <article className="saved-assessment-item" key={item.id}>
                      <div>
                        <h4>{item.title}</h4>
                        <p>
                          {item.documentName} · {item.questionCount} questions ·{" "}
                          {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                        <p>
                          {latest
                            ? `Latest score: ${latest.result.correctCount}/${latest.result.totalQuestions} (${latest.result.percentage}%)`
                            : "No attempts submitted"}
                        </p>
                      </div>
                      <div className="saved-assessment-actions">
                        <button
                          type="button"
                          onClick={() => startSavedAssessment(item)}
                        >
                          New attempt
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewLatestAttempt(item)}
                          disabled={!latest}
                        >
                          Review latest
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssessmentToDelete(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                      {assessmentToDelete === item.id && (
                        <div
                          className="assessment-submit-confirm"
                          role="group"
                          aria-label={`Confirm deletion of ${item.title}`}
                        >
                          <span>
                            Delete this assessment and its saved attempts?
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAssessment(item.id)}
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssessmentToDelete(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default StudyWorkspace;
