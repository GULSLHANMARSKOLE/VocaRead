
import { useEffect, useRef, useState } from "react";
import "./App.css";
import VoiceControl from "./components/VoiceControl";
import FileUploader from "./components/FileUploader";
import StructuredDocument from "./components/StructuredDocument";
import ExplanationPanel from "./components/ExplanationPanel";
import DocumentLibrary from "./components/DocumentLibrary";
import StudyWorkspace from "./pages/StudyWorkspace";
import {
   deleteDocument,
   getDocument,
   listDocuments,
   markDocumentOpened,
   renameDocument,
   saveDocument,
   updateReadingProgress,
   deleteStudyIndex,
   deleteAssessment,
   listAssessments
 } from  "./utils/documentStorage";


const SPEECH_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const COMMON_ABBREVIATIONS = [
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "sr.",
  "jr.",
  "st.",
  "vs.",
  "etc.",
  "e.g.",
  "i.e.",
  "u.s.",
  "u.k.",
  "approx.",
];

const clampSpeed = (value) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.75, parsed));
};

const createDocumentId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `vocaread-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getDocumentDisplayName = (fileName) => {
  const name = fileName?.replace(/\.[^.]+$/, "").trim();
  return name || "Untitled document";
};

const normalizeSpeechText = (input) => {
  if (!input) {
    return "";
  }

  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, "$1")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 divided by $2")
    .replace(/\\(alpha|beta|lambda|times|cdot|pm|infty)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isDecimalPoint = (source, index) => {
  if (source[index] !== ".") {
    return false;
  }

  const before = source.slice(0, index).trim().slice(-1);
  const after = source.slice(index + 1, index + 2);

  return /\d/.test(before) && /\d/.test(after);
};

const isAbbreviation = (chunk) => {
  const lastToken = chunk.trim().split(/\s+/).pop()?.toLowerCase() || "";

  if (!lastToken) {
    return false;
  }

  if (COMMON_ABBREVIATIONS.includes(lastToken)) {
    return true;
  }

  const compact = lastToken.replace(/[^a-z.]/g, "");

  return /^[a-z]\.$/.test(compact);
};

const splitReadableSentences = (sourceText) => {
  const normalized = normalizeSpeechText(sourceText);

  if (!normalized) {
    return [];
  }

  const sentences = [];
  let buffer = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    buffer += character;

    const isSentenceBoundary = /[.!?]/.test(character);

    if (!isSentenceBoundary) {
      continue;
    }

    if (character === "." && isDecimalPoint(normalized, index)) {
      continue;
    }

    if (character === "." && isAbbreviation(buffer)) {
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < normalized.length && /\s/.test(normalized[nextIndex])) {
      nextIndex += 1;
    }

    const nextCharacter = normalized[nextIndex] || "";
    const shouldSplit = !nextCharacter || /[A-Z0-9(["']/.test(nextCharacter);

    if (shouldSplit) {
      const sentence = buffer.trim();

      if (sentence) {
        sentences.push(sentence.replace(/\s+/g, " ").trim());
      }

      buffer = "";
    }
  }

  const finalSentence = buffer.trim();

  if (finalSentence) {
    sentences.push(finalSentence.replace(/\s+/g, " ").trim());
  }

  return sentences.filter(Boolean);
};

function App() {
  const [text, setText] = useState("");
  const [originalFile, setOriginalFile] = useState(null);
  const [originalFileName, setOriginalFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [structuredText, setStructuredText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");

  const [readingSpeed, setReadingSpeed] = useState(1);
  const [readingSentences, setReadingSentences] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [status, setStatus] = useState("idle");
  const [readingMode, setReadingMode] = useState("document");
  const [selectionSourceText, setSelectionSourceText] = useState("");
  const [playbackMode, setPlaybackMode] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [selectionOrigin, setSelectionOrigin] = useState("source");
  const [explanationLanguage, setExplanationLanguage] = useState("english");
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explanationError, setExplanationError] = useState("");
  const [isExplanationPanelOpen, setIsExplanationPanelOpen] = useState(true);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [activeDocumentName, setActiveDocumentName] = useState("");
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [documentLibraryError, setDocumentLibraryError] = useState("");
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isOpeningDocument, setIsOpeningDocument] = useState(false);
  const [documentSaveStatus, setDocumentSaveStatus] = useState("");
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const [currentView, setCurrentView] = useState("home");
  const [studyInitialTab, setStudyInitialTab] = useState("ask");
  const [studyNavigationKey, setStudyNavigationKey] = useState(0);

  const speechSessionRef = useRef(0);
  const utteranceRef = useRef(null);
  const explanationRequestRef = useRef(0);
  const explanationAbortRef = useRef(null);
  const explanationResumeStatusRef = useRef("idle");
  const explanationResumeModeRef = useRef("document");
  const resumeDocumentAfterExplanationRef = useRef(false);
  const sourcePreviewRef = useRef(null);
  const structuredPreviewRef = useRef(null);
  const activeDocumentIdRef = useRef(null);
  const activeDocumentNameRef = useRef("");
  const documentSessionRef = useRef(0);
  const openRequestRef = useRef(0);
  const saveLockRef = useRef(false);
  const processingRequestRef = useRef(0);
  const documentDirtyRef = useRef(false);
  const documentProgressRef = useRef({
    currentSentenceIndex: 0,
    sentenceCount: 0,
    readingSpeed: 1,
    readingProgress: 0,
    isCompleted: false,
  });
  const mainReadingSentencesRef = useRef([]);
  const selectionResumeStatusRef = useRef("idle");
  const resumeDocumentAfterSelectionRef = useRef(false);
  const pendingProgressRef = useRef(null);
  const progressWriteTimerRef = useRef(null);
  const progressWriteQueueRef = useRef(Promise.resolve());
  const hasSpeechSupport =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const documentText = structuredText || text;
  const totalSentenceCount = readingSentences.length;

  const progressPercent =
    totalSentenceCount === 0
      ? 0
      : status === "finished"
        ? 100
        : Math.min(
            100,
            Math.round(
              ((Math.min(currentSentenceIndex + 1, totalSentenceCount) /
                totalSentenceCount) *
                100),
            ),
          );

  const refreshSavedDocuments = async () => {
    try {
      const documents = await listDocuments();
      setSavedDocuments(documents);
      setDocumentLibraryError("");
      return documents;
    } catch (error) {
      setDocumentLibraryError(
        error.message || "Could not load saved documents from this browser.",
      );
      return null;
    }
  };

  const enqueueProgressWrite = (snapshot, force = false) => {
    progressWriteQueueRef.current = progressWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          !force &&
          (snapshot.sessionId !== documentSessionRef.current ||
            documentDirtyRef.current)
        ) {
          return null;
        }

        const updatedDocument = await updateReadingProgress(
          snapshot.id,
          snapshot.progress,
        );
        setSavedDocuments((documents) =>
          documents.map((document) =>
            document.id === updatedDocument.id
              ? { ...document, ...updatedDocument }
              : document,
          ),
        );
        return updatedDocument;
      })
      .catch((error) => {
        if (activeDocumentIdRef.current === snapshot.id) {
          setDocumentLibraryError(
            error.message || "Could not save reading progress.",
          );
        }
        return null;
      });

    return progressWriteQueueRef.current;
  };

  const scheduleProgressWrite = () => {
    const id = activeDocumentIdRef.current;

    if (!id || documentDirtyRef.current) {
      return;
    }

    const snapshot = {
      id,
      sessionId: documentSessionRef.current,
      progress: { ...documentProgressRef.current },
    };
    pendingProgressRef.current = snapshot;
    window.clearTimeout(progressWriteTimerRef.current);
    progressWriteTimerRef.current = window.setTimeout(() => {
      pendingProgressRef.current = null;
      enqueueProgressWrite(snapshot);
    }, 700);
  };

  const flushProgressWrite = (force = false) => {
    window.clearTimeout(progressWriteTimerRef.current);
    progressWriteTimerRef.current = null;
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;

    if (pending) {
      return enqueueProgressWrite(pending, force);
    }

    return progressWriteQueueRef.current;
  };

  const cancelPendingProgressWrite = () => {
    window.clearTimeout(progressWriteTimerRef.current);
    progressWriteTimerRef.current = null;
    pendingProgressRef.current = null;
  };

  const rememberDocumentProgress = (
    sentenceIndex,
    sentences,
    { completed = false, speed = readingSpeed } = {},
  ) => {
    const sentenceCount = sentences.length;
    const currentSentenceIndex = sentenceCount
      ? Math.min(Math.max(0, sentenceIndex), sentenceCount - 1)
      : 0;
    const readingProgress = sentenceCount
      ? completed
        ? 100
        : Math.round(((currentSentenceIndex + 1) / sentenceCount) * 100)
      : 0;

    documentProgressRef.current = {
      currentSentenceIndex,
      sentenceCount,
      readingSpeed: speed,
      readingProgress,
      isCompleted: completed,
    };
    scheduleProgressWrite();
  };

  const restoreMainReaderAfterSelection = (nextStatus) => {
    setPlaybackMode("");
    setReadingMode("document");
    setReadingSentences(mainReadingSentencesRef.current);
    setCurrentSentenceIndex(documentProgressRef.current.currentSentenceIndex);
    setStatus(nextStatus);
  };

  useEffect(() => {
    let isMounted = true;
    listDocuments()
      .then((documents) => {
        if (isMounted) {
          setSavedDocuments(documents);
          setDocumentLibraryError("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setDocumentLibraryError(
            error.message || "Could not load saved documents from this browser.",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLibraryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(progressWriteTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!hasSpeechSupport) {
      return undefined;
    }

    return () => {
      speechSynthesis.cancel();
      utteranceRef.current = null;
      explanationRequestRef.current += 1;
      explanationAbortRef.current?.abort();
    };
  }, [hasSpeechSupport]);

  const cancelActiveSpeech = () => {
    speechSessionRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.cancel();
    }

    utteranceRef.current = null;
  };

  const startReadingSession = ({
    sourceText,
    sentenceList,
    startIndex = 0,
    mode,
    preserveDocumentState = false,
    rate = readingSpeed,
  }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    const nextSentenceList =
      sentenceList && sentenceList.length > 0
        ? sentenceList
        : splitReadableSentences(sourceText || documentText);

    if (!nextSentenceList.length) {
      alert("No readable sentences were found in the selected content.");
      setReadingSentences([]);
      setStatus("idle");
      return;
    }

    if (mode === "document") {
      mainReadingSentencesRef.current = nextSentenceList;
      rememberDocumentProgress(startIndex, nextSentenceList, {
        completed: false,
        speed: rate,
      });
      resumeDocumentAfterSelectionRef.current = false;
    } else if (mode === "selection" && playbackMode !== "selection") {
      selectionResumeStatusRef.current =
        playbackMode === "document" && status === "reading" ? "paused" : status;
      resumeDocumentAfterSelectionRef.current =
        playbackMode === "document" &&
        (status === "reading" || status === "paused");
    }

    if (
      mode === "explanation" &&
      playbackMode !== "explanation" &&
      !resumeDocumentAfterExplanationRef.current
    ) {
      const hasInterruptedDocumentPlayback =
        playbackMode === "document" || playbackMode === "selection";
      explanationResumeStatusRef.current =
        hasInterruptedDocumentPlayback && status === "reading" ? "paused" : status;
      explanationResumeModeRef.current = readingMode;
      resumeDocumentAfterExplanationRef.current =
        hasInterruptedDocumentPlayback &&
        (status === "reading" || status === "paused");
    } else if (mode !== "explanation") {
      resumeDocumentAfterExplanationRef.current = false;
    }

    cancelActiveSpeech();
    const sessionId = speechSessionRef.current;

    setPlaybackMode(mode);

    if (!preserveDocumentState) {
      setReadingMode(mode);
      setReadingSentences(nextSentenceList);
      setCurrentSentenceIndex(Math.min(startIndex, nextSentenceList.length - 1));
    }

    setStatus("reading");

    const speakSentence = (index) => {
      if (speechSessionRef.current !== sessionId) {
        return;
      }

      const sentence = nextSentenceList[index];

      if (!sentence) {
        setStatus("finished");
        return;
      }

      if (!preserveDocumentState) {
        setCurrentSentenceIndex(index);
      }

      if (mode === "document") {
        rememberDocumentProgress(index, nextSentenceList, {
          completed: false,
          speed: rate,
        });
      }

      setStatus("reading");

      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = clampSpeed(rate);
      utterance.lang =
        mode === "explanation" && explanationLanguage === "hinglish"
          ? "hi-IN"
          : "en-US";

      utterance.onend = () => {
        if (speechSessionRef.current !== sessionId) {
          return;
        }

        if (index + 1 < nextSentenceList.length) {
          speakSentence(index + 1);
        } else if (mode === "explanation") {
          setPlaybackMode("");
          setStatus(explanationResumeStatusRef.current);
        } else if (mode === "selection") {
          restoreMainReaderAfterSelection(selectionResumeStatusRef.current);
        } else {
          rememberDocumentProgress(index, nextSentenceList, {
            completed: true,
            speed: rate,
          });
          flushProgressWrite();
          setPlaybackMode("");
          setStatus("finished");
        }
      };

      utterance.onerror = (event) => {
        if (speechSessionRef.current !== sessionId) {
          return;
        }

        if (event && event.error !== "canceled") {
          if (mode === "explanation") {
            setPlaybackMode("");
            setStatus(explanationResumeStatusRef.current);
          } else if (mode === "selection") {
            restoreMainReaderAfterSelection(selectionResumeStatusRef.current);
          } else {
            setPlaybackMode("");
            setStatus("idle");
          }
        }
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    };

    speakSentence(Math.min(startIndex, nextSentenceList.length - 1));
  };

  const cancelExplanationRequest = () => {
    explanationRequestRef.current += 1;
    explanationAbortRef.current?.abort();
    explanationAbortRef.current = null;
  };

  const clearExplanation = () => {
    cancelExplanationRequest();
    setSelectedText("");
    setSelectionError("");
    setIsExplaining(false);
    setExplanation("");
    setExplanationError("");
  };

  const captureDocumentSelection = (container, origin) => {
    if (typeof window === "undefined" || !container) {
      return;
    }

    const selection = window.getSelection();
    const anchor = selection?.anchorNode;

    if (anchor && !container.contains(anchor)) {
      return;
    }

    const selected = selection?.toString().trim() || "";
    cancelExplanationRequest();
    setSelectedText(selected);
    setSelectionError(
      selected.length > 5000
        ? "Select no more than 5,000 characters to explain."
        : "",
    );
    setSelectionOrigin(origin);
    setIsExplaining(false);
    setExplanation("");
    setExplanationError("");
    setIsExplanationPanelOpen(true);
  };

  const handleExplanationLanguageChange = (language) => {
    cancelExplanationRequest();
    setExplanationLanguage(language);
    setIsExplaining(false);
    setExplanation("");
    setExplanationError("");
  };

  const handleExplainSelectedText = async () => {
    const selected = selectedText.trim();

    if (!selected) {
      setExplanationError("Select a word or passage in a document preview first.");
      return;
    }

    if (selected.length > 5000) {
      setSelectionError("Select no more than 5,000 characters to explain.");
      return;
    }

    cancelExplanationRequest();
    const requestId = explanationRequestRef.current;
    const controller = new AbortController();
    explanationAbortRef.current = controller;
    const contextDocument =
      selectionOrigin === "structured" ? structuredText : text;
    const matchIndex = contextDocument.indexOf(selected);
    const context =
      matchIndex >= 0
        ? contextDocument.slice(
            Math.max(0, matchIndex - 3500),
            Math.min(contextDocument.length, matchIndex + selected.length + 3500),
          )
        : contextDocument.slice(0, 12000);

    setIsExplaining(true);
    setExplanation("");
    setExplanationError("");

    try {
      const response = await fetch("http://localhost:5000/api/explain-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          selectedText: selected,
          context,
          language: explanationLanguage,
          mode: "auto",
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      const responseBody = await response.text();
      const isJsonResponse = contentType.toLowerCase().includes("json");

      if (!responseBody.trim()) {
        throw new Error(
          `The backend returned an empty response (HTTP ${response.status}).`,
        );
      }

      if (!isJsonResponse) {
        if (import.meta.env.DEV) {
          console.error("Explain endpoint returned a non-JSON response:", {
            status: response.status,
            contentType: contentType || "missing",
          });
        }

        const looksLikeHtml =
          contentType.toLowerCase().includes("html") ||
          /^\s*<!doctype html|^\s*<html\b/i.test(responseBody);
        const message = looksLikeHtml
          ? response.status === 404
            ? "The server returned an HTML 404 page. The backend on port 5000 may be an older version without /api/explain-text; restart the VocaRead backend."
            : `The backend returned an HTML error page (HTTP ${response.status}) instead of JSON.`
          : `The backend returned ${contentType || "a non-JSON response"} (HTTP ${response.status}) instead of JSON.`;

        throw new Error(message);
      }

      let data;
      try {
        data = JSON.parse(responseBody);
      } catch {
        if (import.meta.env.DEV) {
          console.error("Explain endpoint returned malformed JSON:", {
            status: response.status,
            contentType,
          });
        }
        throw new Error(
          `The backend returned malformed JSON (HTTP ${response.status}). Check the backend terminal for the request error.`,
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error || `The backend rejected the request (HTTP ${response.status}).`,
        );
      }

      if (typeof data.explanation !== "string" || !data.explanation.trim()) {
        throw new Error("The backend did not return a valid explanation.");
      }

      if (explanationRequestRef.current === requestId) {
        setExplanation(data.explanation.trim());
      }
    } catch (error) {
      if (
        error.name !== "AbortError" &&
        explanationRequestRef.current === requestId
      ) {
        if (error instanceof TypeError && import.meta.env.DEV) {
          console.error("Could not reach the VocaRead explain endpoint:", {
            endpoint: "http://localhost:5000/api/explain-text",
            message: error.message,
          });
        }

        setExplanationError(
          error instanceof TypeError
            ? "Could not reach the backend at http://localhost:5000. Start or restart the VocaRead backend, then retry."
            : error.message || "Could not generate an explanation. Please retry.",
        );
      }
    } finally {
      if (explanationRequestRef.current === requestId) {
        setIsExplaining(false);
        explanationAbortRef.current = null;
      }
    }
  };

  const handleReadExplanationAloud = () => {
    if (!explanation.trim()) {
      return;
    }

    const sentences = splitReadableSentences(explanation);

    startReadingSession({
      sourceText: explanation,
      sentenceList: sentences,
      startIndex: 0,
      mode: "explanation",
      preserveDocumentState: true,
    });
  };

  const handleSaveDocument = async () => {
    if (saveLockRef.current || isSavingDocument || isProcessing) {
      return;
    }

    if (!text.trim() && !structuredText.trim()) {
      setDocumentSaveStatus("Add or upload document content before saving.");
      return;
    }

    const sessionId = documentSessionRef.current;
    const existingId = activeDocumentIdRef.current;
    const id = existingId || createDocumentId();
    const name =
      activeDocumentNameRef.current || getDocumentDisplayName(originalFileName);
    const sourceForReading = structuredText || text;
    const sentences =
      mainReadingSentencesRef.current.length > 0
        ? mainReadingSentencesRef.current
        : splitReadableSentences(sourceForReading);
    const progress = { ...documentProgressRef.current };

    if (!progress.sentenceCount && sentences.length) {
      progress.sentenceCount = sentences.length;
      progress.currentSentenceIndex = Math.min(
        progress.currentSentenceIndex,
        sentences.length - 1,
      );
      progress.readingProgress = sentences.length
        ? Math.round(((progress.currentSentenceIndex + 1) / sentences.length) * 100)
        : 0;
    }

    saveLockRef.current = true;
    setIsSavingDocument(true);
    setDocumentSaveStatus("");
    setDocumentLibraryError("");

    try {
      await flushProgressWrite();
      if (documentSessionRef.current !== sessionId) {
        throw new Error("The document changed while saving. Please save the current document again.");
      }
      const now = new Date().toISOString();
      const saved = await saveDocument({
        id,
        name,
        originalFileName: originalFileName || "",
        fileType: fileType || "",
        sourceText: text,
        structuredMarkdown: structuredText,
        currentSentenceIndex: progress.currentSentenceIndex,
        sentenceCount: progress.sentenceCount,
        readingSpeed,
        readingProgress: progress.readingProgress,
        isCompleted: progress.isCompleted,
        ...(existingId ? {} : { lastOpenedAt: now }),
      });

      setSavedDocuments((documents) => {
        const nextDocuments = [
          ...documents.filter((document) => document.id !== saved.id),
          saved,
        ];
        return nextDocuments.sort((first, second) =>
          (second.lastOpenedAt || second.updatedAt || "").localeCompare(
            first.lastOpenedAt || first.updatedAt || "",
          ),
        );
      });

      if (documentSessionRef.current === sessionId) {
        activeDocumentIdRef.current = saved.id;
        activeDocumentNameRef.current = saved.name;
        setActiveDocumentId(saved.id);
        setActiveDocumentName(saved.name);
        documentDirtyRef.current = false;
        setDocumentSaveStatus(`Saved “${saved.name}”.`);
      } else {
        setDocumentSaveStatus(`Saved “${saved.name}”.`);
      }
      await refreshSavedDocuments();
      return saved.id;
    } catch (error) {
      setDocumentSaveStatus(
        error.message || "Could not save this document in browser storage.",
      );
      return null;
    } finally {
      saveLockRef.current = false;
      setIsSavingDocument(false);
    }
  };

  const enterStudyWorkspace = async (tab) => {
    let id = activeDocumentIdRef.current;

    if (!id || documentDirtyRef.current) {
      id = await handleSaveDocument();
    }

    if (id) {
      setStudyInitialTab(tab);
      setStudyNavigationKey((key) => key + 1);
      setCurrentView("study");
    }
  };

  const handleOpenSavedDocument = async (id) => {
    if (documentDirtyRef.current && !window.confirm("Discard unsaved changes and open another document?")) {
      return;
    }

    const requestId = ++openRequestRef.current;
    const previousSessionId = documentSessionRef.current;
    setIsOpeningDocument(true);
    setDocumentLibraryError("");
    setDocumentSaveStatus("");
    processingRequestRef.current += 1;
    setIsProcessing(false);
    cancelActiveSpeech();
    clearExplanation();
    setPlaybackMode("");

    try {
      await flushProgressWrite();

      if (requestId !== openRequestRef.current) {
        return;
      }

      if (documentSessionRef.current !== previousSessionId) {
        throw new Error("The current document changed while opening. Please try again.");
      }

      const saved = await getDocument(id);

      if (!saved) {
        throw new Error("This saved document could not be found.");
      }

      const nextSessionId = ++documentSessionRef.current;
      const readableSource = saved.structuredMarkdown || saved.sourceText || "";
      const sentences = splitReadableSentences(readableSource);
      const currentSentenceIndex = sentences.length
        ? Math.min(
            Math.max(0, Number(saved.currentSentenceIndex) || 0),
            sentences.length - 1,
          )
        : 0;
      const completed = Boolean(saved.isCompleted) && sentences.length > 0;
      const speed = clampSpeed(saved.readingSpeed);
      const opened = await markDocumentOpened(id);

      if (
        requestId !== openRequestRef.current ||
        documentSessionRef.current !== nextSessionId
      ) {
        return;
      }

      activeDocumentIdRef.current = saved.id;
      activeDocumentNameRef.current = saved.name;
      documentDirtyRef.current = false;
      documentProgressRef.current = {
        currentSentenceIndex,
        sentenceCount: sentences.length,
        readingSpeed: speed,
        readingProgress: completed
          ? 100
          : sentences.length
            ? Math.round(((currentSentenceIndex + 1) / sentences.length) * 100)
            : 0,
        isCompleted: completed,
      };
      mainReadingSentencesRef.current = sentences;

      setActiveDocumentId(saved.id);
      setActiveDocumentName(saved.name);
      setOriginalFile(null);
      setOriginalFileName(saved.originalFileName || "");
      setFileType(saved.fileType || "");
      setText(saved.sourceText || "");
      setStructuredText(saved.structuredMarkdown || "");
      setReadingSpeed(speed);
      setReadingSentences(sentences);
      setCurrentSentenceIndex(currentSentenceIndex);
      setReadingMode("document");
      setSelectionSourceText("");
      setStatus(completed ? "finished" : "idle");
      setPlaybackMode("");
      setVoiceResetSignal((signal) => signal + 1);
      await refreshSavedDocuments();
      setSavedDocuments((documents) =>
        documents.map((document) =>
          document.id === opened.id ? { ...document, ...opened } : document,
        ),
      );
      return true;
    } catch (error) {
      if (requestId === openRequestRef.current) {
        setDocumentLibraryError(
          error.message || "Could not open the saved document.",
        );
      }
      return false;
    } finally {
      if (requestId === openRequestRef.current) {
        setIsOpeningDocument(false);
      }
    }
  };

  const handleRenameSavedDocument = async (id, name) => {
    try {
      const renamed = await renameDocument(id, name);
      setSavedDocuments((documents) =>
        documents.map((document) =>
          document.id === id ? { ...document, ...renamed } : document,
        ),
      );

      if (activeDocumentIdRef.current === id) {
        activeDocumentNameRef.current = renamed.name;
        setActiveDocumentName(renamed.name);
      }
      await refreshSavedDocuments();
    } catch (error) {
      setDocumentLibraryError(error.message || "Could not rename this document.");
    }
  };

 const handleDeleteSavedDocument = async (id) => {
  try {
    if (activeDocumentIdRef.current === id) {
      cancelActiveSpeech();
      setPlaybackMode("");
      setStatus("stopped");
      await flushProgressWrite();
    }

    // Remove the document's RAG index and chunks.
    await deleteStudyIndex(id);

    // Remove assessments belonging to this document.
    const assessments = await listAssessments();

    for (const assessment of assessments) {
      if (assessment.documentId === id) {
        await deleteAssessment(assessment.id);
      }
    }

    // Delete the document itself.
    await deleteDocument(id);

    setSavedDocuments((documents) =>
      documents.filter((document) => document.id !== id)
    );

    if (activeDocumentIdRef.current === id) {
      activeDocumentIdRef.current = null;
      activeDocumentNameRef.current = "";
      documentDirtyRef.current = false;

      setActiveDocumentId(null);
      setActiveDocumentName("");

      setDocumentSaveStatus(
        "Deleted from the library. The open content remains available to save again."
      );
    }

    await refreshSavedDocuments();
  } catch (error) {
    setDocumentLibraryError(
      error.message || "Could not delete this document."
    );
  }
};

  const handleTextChange = (newText) => {
    flushProgressWrite(true);
    documentSessionRef.current += 1;
    processingRequestRef.current += 1;
    documentDirtyRef.current = Boolean(activeDocumentIdRef.current);
    clearExplanation();
    setIsProcessing(false);
    setText(newText);
    setOriginalFile(null);
    setOriginalFileName("");
    setFileType("");
    setStructuredText("");
    setProcessingError("");
    setReadingSentences([]);
    setCurrentSentenceIndex(0);
    setStatus("idle");
    setReadingMode("document");
    setSelectionSourceText("");
    setPlaybackMode("");
    resumeDocumentAfterExplanationRef.current = false;
    resumeDocumentAfterSelectionRef.current = false;
    mainReadingSentencesRef.current = [];
    documentProgressRef.current = {
      currentSentenceIndex: 0,
      sentenceCount: splitReadableSentences(newText).length,
      readingSpeed,
      readingProgress: 0,
      isCompleted: false,
    };

    cancelActiveSpeech();
  };

  const handleTextExtracted = async (extractedText, file) => {
    processingRequestRef.current += 1;
    setIsProcessing(false);
    cancelActiveSpeech();
    const sessionId = documentSessionRef.current;
    await flushProgressWrite(true);
    if (documentSessionRef.current !== sessionId) {
      return;
    }
    documentSessionRef.current += 1;
    activeDocumentIdRef.current = null;
    activeDocumentNameRef.current = "";
    documentDirtyRef.current = false;
    clearExplanation();
    setText(extractedText);
    setOriginalFile(file);
    setOriginalFileName(file?.name || "");
    setFileType(file?.type || "");
    setStructuredText("");
    setProcessingError("");
    setReadingSentences([]);
    setCurrentSentenceIndex(0);
    setStatus("idle");
    setReadingMode("document");
    setSelectionSourceText("");
    setPlaybackMode("");
    resumeDocumentAfterExplanationRef.current = false;
    resumeDocumentAfterSelectionRef.current = false;
    mainReadingSentencesRef.current = splitReadableSentences(extractedText);
    documentProgressRef.current = {
      currentSentenceIndex: 0,
      sentenceCount: mainReadingSentencesRef.current.length,
      readingSpeed,
      readingProgress: 0,
      isCompleted: false,
    };
    setActiveDocumentId(null);
    setActiveDocumentName("");
    setDocumentSaveStatus("");
  };

  const handleProcessDocument = async () => {
    if (isProcessing) return;

    if (!text.trim() && !originalFile) {
      setProcessingError(
        "Please upload a document or enter some text first."
      );
      return;
    }

    const processSessionId = documentSessionRef.current;
    const requestId = ++processingRequestRef.current;
    const sourceText = text;
    const sourceFile = originalFile;
    const payloadText =
      sourceText.trim() ||
      "No selectable text was extracted from the uploaded file. Please analyze the original file content.";

    flushProgressWrite(true);
    documentDirtyRef.current = Boolean(activeDocumentIdRef.current);
    cancelPendingProgressWrite();
    clearExplanation();
    setIsProcessing(true);
    setProcessingError("");
    setStructuredText("");
    setReadingSentences([]);
    setCurrentSentenceIndex(0);
    setStatus("idle");
    setSelectionSourceText("");
    setPlaybackMode("");
    resumeDocumentAfterExplanationRef.current = false;
    resumeDocumentAfterSelectionRef.current = false;
    cancelActiveSpeech();
    mainReadingSentencesRef.current = splitReadableSentences(sourceText);
    documentProgressRef.current = {
      currentSentenceIndex: 0,
      sentenceCount: mainReadingSentencesRef.current.length,
      readingSpeed,
      readingProgress: 0,
      isCompleted: false,
    };

    try {
      const formData = new FormData();
      formData.append("extractedText", payloadText);

      if (sourceFile) {
        const fileName = sourceFile.name.toLowerCase();
        const isPdf = fileName.endsWith(".pdf");
        const isImage = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(fileName);

        if (isPdf || isImage) {
          formData.append("originalFile", sourceFile);
        }
      }

      const response = await fetch(
        "http://localhost:5000/api/process-document",
        {
          method: "POST",
          body: formData,
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error("The backend responded with invalid JSON.");
      }

      if (!response.ok) {
        throw new Error(
          data?.error || `Request failed with status ${response.status}.`
        );
      }

      if (
        typeof data.structuredMarkdown !== "string" ||
        !data.structuredMarkdown.trim()
      ) {
        throw new Error("The backend did not return a valid structured document.");
      }

      if (
        requestId !== processingRequestRef.current ||
        processSessionId !== documentSessionRef.current
      ) {
        return;
      }

      clearExplanation();
      setStructuredText(data.structuredMarkdown);
      mainReadingSentencesRef.current = splitReadableSentences(
        data.structuredMarkdown,
      );
      documentProgressRef.current = {
        currentSentenceIndex: 0,
        sentenceCount: mainReadingSentencesRef.current.length,
        readingSpeed,
        readingProgress: 0,
        isCompleted: false,
      };
    } catch (error) {
      if (
        requestId === processingRequestRef.current &&
        processSessionId === documentSessionRef.current
      ) {
        console.error("AI processing error:", error);
        setProcessingError(
          error.message ||
            "Could not process the document. Check the backend connection."
        );
      }
    } finally {
      if (requestId === processingRequestRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const handleSpeedChange = (event) => {
    const nextSpeed = clampSpeed(event.target.value);
    setReadingSpeed(nextSpeed);
    documentProgressRef.current = {
      ...documentProgressRef.current,
      readingSpeed: nextSpeed,
    };
    scheduleProgressWrite();

    if (playbackMode === "explanation" && explanation.trim()) {
      startReadingSession({
        sourceText: explanation,
        sentenceList: splitReadableSentences(explanation),
        startIndex: 0,
        mode: "explanation",
        preserveDocumentState: true,
        rate: nextSpeed,
      });
      return;
    }

    if (!readingSentences.length) {
      return;
    }

    if (status === "reading" || status === "paused") {
      const nextIndex = Math.max(0, currentSentenceIndex);
      const playbackText = readingMode === "selection" ? selectionSourceText : documentText;

      startReadingSession({
        sourceText: playbackText,
        sentenceList: readingSentences,
        startIndex: nextIndex,
        mode: readingMode,
        rate: nextSpeed,
      });
    }
  };

  const startReading = () => {
    const sourceToRead = structuredText || text;

    if (!sourceToRead.trim()) {
      alert("Please enter or upload some text first.");
      return;
    }

    const nextSentenceList = splitReadableSentences(sourceToRead);

    if (!nextSentenceList.length) {
      alert("No readable sentences were found.");
      return;
    }

    setSelectionSourceText("");
    startReadingSession({
      sourceText: sourceToRead,
      sentenceList: nextSentenceList,
      startIndex: 0,
      mode: "document",
    });
  };

  const pauseReading = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    if (status !== "reading") {
      return;
    }

    speechSynthesis.pause();
    setStatus("paused");
    flushProgressWrite();
  };

  const resumeReading = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    if (
      status !== "paused" &&
      readingMode === "document" &&
      readingSentences.length > 0 &&
      ["idle", "stopped", "finished"].includes(status)
    ) {
      startReadingSession({
        sourceText: documentText,
        sentenceList: readingSentences,
        startIndex: currentSentenceIndex,
        mode: "document",
      });
      return;
    }

    if (status !== "paused") {
      return;
    }

    if (
      resumeDocumentAfterSelectionRef.current &&
      playbackMode !== "selection"
    ) {
      resumeDocumentAfterSelectionRef.current = false;
      startReadingSession({
        sourceText: documentText,
        sentenceList: mainReadingSentencesRef.current,
        startIndex: documentProgressRef.current.currentSentenceIndex,
        mode: "document",
      });
      return;
    }

    if (
      resumeDocumentAfterExplanationRef.current &&
      playbackMode !== "explanation"
    ) {
      resumeDocumentAfterExplanationRef.current = false;
      startReadingSession({
        sourceText:
          explanationResumeModeRef.current === "selection"
            ? selectionSourceText
            : documentText,
        sentenceList: readingSentences,
        startIndex: currentSentenceIndex,
        mode: explanationResumeModeRef.current,
      });
      return;
    }

    speechSynthesis.resume();
    setStatus("reading");
  };

  const repeatCurrentLine = () => {
    if (!readingSentences.length) {
      return;
    }

    const playbackText = readingMode === "selection" ? selectionSourceText : documentText;
    startReadingSession({
      sourceText: playbackText,
      sentenceList: readingSentences,
      startIndex: currentSentenceIndex,
      mode: readingMode,
    });
  };

  const nextLine = () => {
    if (readingMode === "selection" || !readingSentences.length) {
      return;
    }

    if (currentSentenceIndex >= readingSentences.length - 1) {
      return;
    }

    startReadingSession({
      sourceText: documentText,
      sentenceList: readingSentences,
      startIndex: currentSentenceIndex + 1,
      mode: "document",
    });
  };

  const previousLine = () => {
    if (readingMode === "selection" || !readingSentences.length) {
      return;
    }

    if (currentSentenceIndex <= 0) {
      return;
    }

    startReadingSession({
      sourceText: documentText,
      sentenceList: readingSentences,
      startIndex: currentSentenceIndex - 1,
      mode: "document",
    });
  };

  const stopReading = () => {
    const stoppedMode = playbackMode;
    cancelActiveSpeech();
    if (stoppedMode === "selection") {
      restoreMainReaderAfterSelection(selectionResumeStatusRef.current);
    } else {
      setPlaybackMode("");
      setStatus(
        stoppedMode === "explanation"
          ? explanationResumeStatusRef.current
          : "stopped",
      );
    }
    flushProgressWrite();
  };

  const clearText = async () => {
    cancelActiveSpeech();
    await flushProgressWrite();
    documentSessionRef.current += 1;
    processingRequestRef.current += 1;
    activeDocumentIdRef.current = null;
    activeDocumentNameRef.current = "";
    documentDirtyRef.current = false;
    clearExplanation();
    setIsProcessing(false);
    setText("");
    setOriginalFile(null);
    setOriginalFileName("");
    setFileType("");
    setStructuredText("");
    setProcessingError("");
    setReadingSentences([]);
    setCurrentSentenceIndex(0);
    setStatus("idle");
    setReadingMode("document");
    setSelectionSourceText("");
    setPlaybackMode("");
    resumeDocumentAfterExplanationRef.current = false;
    resumeDocumentAfterSelectionRef.current = false;
    mainReadingSentencesRef.current = [];
    documentProgressRef.current = {
      currentSentenceIndex: 0,
      sentenceCount: 0,
      readingSpeed,
      readingProgress: 0,
      isCompleted: false,
    };
    setActiveDocumentId(null);
    setActiveDocumentName("");
    setDocumentSaveStatus("");
  };

  const handleReadSelectedText = () => {
    if (typeof window === "undefined") {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";

    if (!selectedText) {
      alert("Please select some text in the preview before choosing Read Selected Text.");
      return;
    }

    const selectedSentences = splitReadableSentences(selectedText);

    if (!selectedSentences.length) {
      alert("No readable sentences were found in your selection.");
      return;
    }

    setSelectionSourceText(selectedText);
    startReadingSession({
      sourceText: selectedText,
      sentenceList: selectedSentences,
      startIndex: 0,
      mode: "selection",
    });
  };

  const canNavigateSentences = readingMode !== "selection" && readingSentences.length > 1;

  return (
    <div className="app">
      <h1>VocaRead</h1>

      <p className="subtitle">
        Read your documents aloud, one sentence at a time.
      </p>

      <nav className="vocaread-navigation" aria-label="Main navigation">
        <button
          type="button"
          className={currentView === "home" ? "active" : ""}
          aria-current={currentView === "home" ? "page" : undefined}
          onClick={() => setCurrentView("home")}
        >
          Home
        </button>
        <button
          type="button"
          className={currentView === "study" && studyInitialTab !== "assessments" ? "active" : ""}
          aria-current={currentView === "study" && studyInitialTab !== "assessments" ? "page" : undefined}
          onClick={() => enterStudyWorkspace("ask")}
        >
          Study Workspace
        </button>
        <button
          type="button"
          className={currentView === "study" && studyInitialTab === "assessments" ? "active" : ""}
          aria-current={currentView === "study" && studyInitialTab === "assessments" ? "page" : undefined}
          onClick={() => {
            setStudyInitialTab("assessments");
            setStudyNavigationKey((key) => key + 1);
            setCurrentView("study");
          }}
        >
          My Assessments
        </button>
      </nav>

      {currentView === "home" ? (
        <>
      <div className="reader-container">
        <div className="editor-layout">
          <div className="side-panel left-panel">
            <FileUploader onTextExtracted={handleTextExtracted} />

            <button onClick={startReading}>▶ Start</button>
            <button onClick={pauseReading}>⏸ Pause</button>
            <button onClick={resumeReading}>▶ Resume</button>
            <button
              onClick={handleProcessDocument}
              disabled={isProcessing || !text.trim()}
            >
              {isProcessing ? "Processing..." : "✨ Process Document"}
            </button>
            <button
              onClick={handleSaveDocument}
              disabled={isSavingDocument || isProcessing || (!text.trim() && !structuredText.trim())}
            >
              {isSavingDocument ? "Saving..." : "Save Document"}
            </button>
          </div>

          <textarea
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder="Paste your text here..."
          />

          <div className="side-panel right-panel">
            <button onClick={previousLine} disabled={!canNavigateSentences}>
              ⏮ Previous
            </button>
            <button onClick={nextLine} disabled={!canNavigateSentences}>
              ⏭ Next
            </button>
            <button onClick={repeatCurrentLine}>🔁 Repeat</button>
            <button onClick={stopReading}>⏹ Stop</button>
            <button onClick={clearText}>Clear</button>
          </div>
        </div>

        <div className="meta-row">
          <div className="status-card">
            <span className="meta-label">Status</span>
            <strong>{status}</strong>
          </div>

          <div className="reading-speed-panel" aria-label="Reading speed control">
            <label htmlFor="reading-speed" className="meta-label">
              Reading speed
            </label>
            <select
              id="reading-speed"
              value={String(readingSpeed)}
              onChange={handleSpeedChange}
              aria-label="Select reading speed"
            >
              {SPEECH_SPEEDS.map((speed) => (
                <option key={speed} value={String(speed)}>
                  {speed.toFixed(2).replace(/\.00$/, ".0").replace(/0$/, "")}×
                </option>
              ))}
            </select>
            <span className="speed-display">{readingSpeed.toFixed(2).replace(/\.00$/, ".0").replace(/0$/, "")}×</span>
          </div>

          <VoiceControl
            startReading={startReading}
            pauseReading={pauseReading}
            resumeReading={resumeReading}
            repeatCurrentLine={repeatCurrentLine}
            nextLine={nextLine}
            previousLine={previousLine}
            stopReading={stopReading}
            resetSignal={voiceResetSignal}
          />
        </div>

        <div className="progress-card" aria-live="polite">
          <div className="progress-header">
            <span className="meta-label">Reading progress</span>
            <strong>
              {totalSentenceCount > 0
                ? `Sentence ${Math.min(currentSentenceIndex + 1, totalSentenceCount)} of ${totalSentenceCount}`
                : "Sentence 0 of 0"}
            </strong>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent} aria-label="Reading progress">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="progress-text">
            {totalSentenceCount > 0
              ? `${progressPercent}% complete`
              : "No document ready to read."}
          </div>
        </div>
        {(documentSaveStatus || isOpeningDocument) && (
          <p className="document-save-feedback" role="status" aria-live="polite">
            {isOpeningDocument ? "Opening saved document..." : documentSaveStatus}
          </p>
        )}
        {activeDocumentName && !documentSaveStatus && !isOpeningDocument && (
          <p className="document-save-feedback">Editing saved document: {activeDocumentName}</p>
        )}
      </div>

      <DocumentLibrary
        documents={savedDocuments}
        activeDocumentId={activeDocumentId}
        isLoading={isLibraryLoading}
        isBusy={isOpeningDocument}
        error={documentLibraryError}
        onOpen={handleOpenSavedDocument}
        onRename={handleRenameSavedDocument}
        onDelete={handleDeleteSavedDocument}
      />

      <section
        ref={sourcePreviewRef}
        className="text-preview"
        onMouseUp={() => captureDocumentSelection(sourcePreviewRef.current, "source")}
        onKeyUp={() => captureDocumentSelection(sourcePreviewRef.current, "source")}
      >
        <h2>Source Text</h2>
        <p>
          The text extracted from your uploaded document or entered manually.
        </p>
        <StructuredDocument content={text} />
      </section>

      <div className="selection-actions">
        <button type="button" onClick={handleReadSelectedText} className="read-selected-button">
          Read Selected Text
        </button>
        {!isExplanationPanelOpen && (
          <button type="button" onClick={() => setIsExplanationPanelOpen(true)}>
            Explain Selected Text
          </button>
        )}
      </div>

      {readingSentences.length > 0 && (
        <section className="text-preview reading-preview-panel">
          <h2>Reading Preview</h2>
          <div className="reading-preview" aria-live="polite">
            {readingSentences.map((sentence, index) => (
              <span
                key={`${sentence}-${index}`}
                className={`reading-sentence ${index === currentSentenceIndex ? "active" : ""}`}
              >
                {sentence}
              </span>
            ))}
          </div>
        </section>
      )}

      {isProcessing && (
        <div className="processing-message" role="status">
          Processing your document with Gemini. Please wait...
        </div>
      )}

      {processingError && (
        <div className="processing-error" role="alert">
          <strong>Processing failed:</strong> {processingError}
        </div>
      )}

      {structuredText && (
        <section
          ref={structuredPreviewRef}
          className="text-preview"
          onMouseUp={() => captureDocumentSelection(structuredPreviewRef.current, "structured")}
          onKeyUp={() => captureDocumentSelection(structuredPreviewRef.current, "structured")}
        >
          <h2>Structured Document</h2>
          <p>
            Organized source content. The Start button reads this version aloud.
          </p>
          <StructuredDocument content={structuredText} />
        </section>
      )}

      {isExplanationPanelOpen && (
        <ExplanationPanel
          selectedText={selectedText}
          selectionError={selectionError}
          language={explanationLanguage}
          onLanguageChange={handleExplanationLanguageChange}
          onExplain={handleExplainSelectedText}
          isLoading={isExplaining}
          explanation={explanation}
          error={explanationError}
          onRetry={handleExplainSelectedText}
          onReadAloud={handleReadExplanationAloud}
          playbackStatus={playbackMode === "explanation" ? status : ""}
          onPause={pauseReading}
          onResume={resumeReading}
          onStop={stopReading}
          onClose={() => setIsExplanationPanelOpen(false)}
        />
      )}
        </>
      ) : (
        <StudyWorkspace
          key={`${activeDocumentId || "none"}-${studyInitialTab}-${studyNavigationKey}`}
          documentId={activeDocumentId}
          savedDocuments={savedDocuments}
          initialTab={studyInitialTab}
          onOpenDocument={handleOpenSavedDocument}
          onGoHome={() => setCurrentView("home")}
        />
      )}
    </div>
  );
}

export default App;