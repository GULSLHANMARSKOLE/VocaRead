import { useState } from "react";

function ExplanationPanel({
  selectedText,
  selectionError,
  language,
  onLanguageChange,
  onExplain,
  isLoading,
  explanation,
  error,
  onRetry,
  onReadAloud,
  playbackStatus,
  onPause,
  onResume,
  onStop,
  onClose,
}) {
  const [copyStatus, setCopyStatus] = useState("");

  const copyExplanation = async () => {
    if (!explanation) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Copy is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(explanation);
      setCopyStatus("Explanation copied.");
    } catch {
      setCopyStatus("Could not copy. Check clipboard permissions.");
    }
  };

  return (
    <section className="explanation-panel" aria-labelledby="explanation-title">
      <div className="explanation-header">
        <div>
          <h2 id="explanation-title">Click-to-Explain</h2>
          <p>Select a word or passage in either document preview, then request an explanation.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close explanation panel">
          Close
        </button>
      </div>

      <label className="explanation-language" htmlFor="explanation-language">
        Explanation language
        <select
          id="explanation-language"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
        >
          <option value="english">Simple English</option>
          <option value="hinglish">Hinglish</option>
        </select>
      </label>

      <div className="selected-text-block">
        <span className="meta-label">Selected text</span>
        <p className="selected-text" aria-live="polite">
          {selectedText || "No text selected yet."}
        </p>
        {selectedText.length > 5000 && (
          <p className="assistant-error" role="alert">
            {selectionError || "Select no more than 5,000 characters to explain."}
          </p>
        )}
      </div>

      <button
        type="button"
        className="explain-button"
        onClick={onExplain}
        disabled={!selectedText || selectedText.length > 5000 || isLoading}
      >
        {isLoading ? "Explaining..." : "Explain Selected Text"}
      </button>

      {isLoading && (
        <p className="assistant-loading" role="status" aria-live="polite">
          Generating an explanation with Gemini...
        </p>
      )}

      {error && (
        <div className="assistant-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry} disabled={isLoading || !selectedText}>
            Retry
          </button>
        </div>
      )}

      {explanation && (
        <div className="explanation-result" aria-live="polite">
          <div className="explanation-result-header">
            <span className="meta-label">
              {language === "hinglish" ? "Hinglish explanation" : "Simple English explanation"}
            </span>
            <div className="explanation-actions">
              <button type="button" onClick={copyExplanation}>
                Copy Explanation
              </button>
              {playbackStatus === "reading" ? (
                <button type="button" onClick={onPause} aria-label="Pause explanation audio">
                  Pause Audio
                </button>
              ) : playbackStatus === "paused" ? (
                <button type="button" onClick={onResume} aria-label="Resume explanation audio">
                  Resume Audio
                </button>
              ) : (
                <button type="button" onClick={onReadAloud}>
                  Read Explanation Aloud
                </button>
              )}
              {(playbackStatus === "reading" || playbackStatus === "paused") && (
                <button type="button" onClick={onStop} aria-label="Stop explanation audio">
                  Stop Audio
                </button>
              )}
            </div>
          </div>
          <p className="explanation-copy">{explanation}</p>
          {copyStatus && <span className="copy-status" role="status">{copyStatus}</span>}
        </div>
      )}
    </section>
  );
}

export default ExplanationPanel;