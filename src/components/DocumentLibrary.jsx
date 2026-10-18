import { useState } from "react";

function formatDate(value) {
  if (!value) {
    return "Not opened yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DocumentLibrary({
  documents,
  activeDocumentId,
  isLoading,
  isBusy = false,
  error,
  onOpen,
  onRename,
  onDelete,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  return (
    <section className="document-library" aria-labelledby="document-library-title">
      <div className="document-library-heading">
        <div>
          <h2 id="document-library-title">My Documents</h2>
          <p>Saved documents and reading progress on this device.</p>
        </div>
        {isLoading && (
          <span className="library-loading" role="status" aria-live="polite">
            Loading documents...
          </span>
        )}
      </div>

      {error && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}

      {!isLoading && documents.length === 0 && !error && (
        <p className="library-empty">
          No saved documents yet. Save a document to continue reading it later.
        </p>
      )}

      {documents.length > 0 && (
        <div className="document-list">
          {documents.map((document) => {
            const progress = Math.min(
              100,
              Math.max(0, Math.round(document.readingProgress || 0)),
            );
            const documentType =
              document.originalFileName || document.fileType || "Text document";

            return (
              <article className="document-list-item" key={document.id}>
                <div className="document-list-details">
                  <h3>
                    {document.name}
                    {document.id === activeDocumentId && (
                      <span className="document-active-label">Open</span>
                    )}
                  </h3>
                  <p className="document-list-meta">
                    {documentType} · Last opened or updated {formatDate(document.lastOpenedAt || document.updatedAt)}
                  </p>
                  {renamingId === document.id && (
                    <form
                      className="document-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const normalizedName = renameValue.trim();
                        if (normalizedName) {
                          onRename(document.id, normalizedName);
                          setRenamingId(null);
                        }
                      }}
                    >
                      <label htmlFor={`rename-document-${document.id}`}>
                        Document name
                      </label>
                      <input
                        id={`rename-document-${document.id}`}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={160}
                        required
                        autoFocus
                      />
                      <button type="submit" disabled={isBusy}>
                        Save name
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                  <div className="document-list-progress">
                    <div
                      className="progress-bar"
                      role="progressbar"
                      aria-label={`${document.name} reading progress`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={progress}
                    >
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span>{progress}% read</span>
                  </div>
                </div>
                <div className="document-list-actions">
                  <button
                    type="button"
                    onClick={() => onOpen(document.id)}
                    disabled={isBusy}
                  >
                    Open / Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameValue(document.name);
                      setRenamingId(document.id);
                      setConfirmDeleteId(null);
                    }}
                    aria-label={`Rename ${document.name}`}
                    disabled={isBusy}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(document.id);
                      setRenamingId(null);
                    }}
                    aria-label={`Delete ${document.name}`}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                  {confirmDeleteId === document.id && (
                    <div
                      className="document-delete-confirm"
                      role="group"
                      aria-label={`Confirm deletion of ${document.name}`}
                    >
                      <span>Delete permanently?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(document.id, document.name);
                          setConfirmDeleteId(null);
                        }}
                        disabled={isBusy}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default DocumentLibrary;
