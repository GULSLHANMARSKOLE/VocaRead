import { useState } from "react";
import { saveAssessmentAttempt } from "../utils/documentStorage";

function newId() {
  return globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random()}`;
}

function calculateResult(assessment, answers) {
  const totalQuestions = assessment.questions.length;
  const answeredCount = assessment.questions.filter((question) => answers[question.id]).length;
  const correctCount = assessment.questions.filter(
    (question) => answers[question.id] === question.correctOptionId,
  ).length;
  const incorrectCount = answeredCount - correctCount;
  const unansweredCount = totalQuestions - answeredCount;

  return {
    totalQuestions,
    answeredCount,
    correctCount,
    incorrectCount,
    unansweredCount,
    percentage: totalQuestions
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0,
  };
}

function AssessmentResults({ assessment, reviewAttempt = null, onClose, onAttemptSaved }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submittedAttempt, setSubmittedAttempt] = useState(reviewAttempt);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (!assessment.questions.length) {
    return (
      <section className="assessment-workspace">
        <p>This assessment has no questions to display.</p>
        <button type="button" onClick={onClose}>Back</button>
      </section>
    );
  }

  const activeQuestion = assessment.questions[questionIndex];
  const result = submittedAttempt?.result;

  const submitAttempt = async () => {
    const score = calculateResult(assessment, answers);
    const attempt = {
      id: newId(),
      assessmentId: assessment.id,
      documentId: assessment.documentId,
      submittedAt: new Date().toISOString(),
      answers: { ...answers },
      result: score,
    };

    setIsSaving(true);
    setSaveError("");
    try {
      const saved = await saveAssessmentAttempt(attempt);
      setSubmittedAttempt(saved);
      setConfirmSubmit(false);
      onAttemptSaved?.();
    } catch (error) {
      setSaveError(error.message || "Could not save this assessment attempt.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="assessment-workspace" aria-labelledby="assessment-title">
      <div className="study-section-heading">
        <div>
          <span className="study-eyebrow">{assessment.documentName}</span>
          <h2 id="assessment-title">{assessment.title}</h2>
        </div>
        <button type="button" onClick={onClose}>Back to workspace</button>
      </div>

      {submittedAttempt ? (
        <>
          <div className="assessment-score" aria-live="polite">
            <strong>{result.correctCount}/{result.totalQuestions}</strong>
            <span>{result.percentage}%</span>
            <p>
              {result.answeredCount} answered · {result.incorrectCount} incorrect · {result.unansweredCount} unanswered
            </p>
            <small>
              {reviewAttempt ? "Saved attempt review" : "Attempt saved"} · {new Date(submittedAttempt.submittedAt).toLocaleString()}
            </small>
          </div>
          <div className="assessment-review-list">
            {assessment.questions.map((question, index) => {
              const selectedId = submittedAttempt.answers[question.id];
              const selectedOption = question.options.find((option) => option.id === selectedId);
              const correctOption = question.options.find(
                (option) => option.id === question.correctOptionId,
              );

              return (
                <article className="assessment-review-item" key={question.id}>
                  <h3>{index + 1}. {question.question}</h3>
                  <p className={selectedId === question.correctOptionId ? "review-correct" : "review-incorrect"}>
                    Your answer: {selectedOption?.text || "Unanswered"}
                  </p>
                  <p className="review-correct">Correct answer: {correctOption?.text || "Unavailable"}</p>
                  <p>{question.explanation}</p>
                  <p className="study-citation-label">
                    Source: {question.sourceLabels?.join(", ") || "Passage references saved with this question"}
                  </p>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="assessment-question-heading">
            <strong>Question {questionIndex + 1} of {assessment.questions.length}</strong>
            <span>{Object.keys(answers).length} answered</span>
          </div>
          <progress
            className="assessment-progress"
            value={questionIndex + 1}
            max={assessment.questions.length}
            aria-label="Assessment progress"
          />
          <article className="assessment-question">
            <h3>{activeQuestion.question}</h3>
            <fieldset>
              <legend className="visually-hidden">Select one answer</legend>
              {activeQuestion.options.map((option) => (
                <label className="assessment-option" key={option.id}>
                  <input
                    type="radio"
                    name={`question-${activeQuestion.id}`}
                    value={option.id}
                    checked={answers[activeQuestion.id] === option.id}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [activeQuestion.id]: option.id,
                      }))
                    }
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </fieldset>
            <p className="study-citation-label">
              Source: {activeQuestion.sourceLabels?.join(", ") || "Document passage"}
            </p>
          </article>
          <div className="assessment-question-nav" aria-label="Question navigation">
            {assessment.questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={index === questionIndex ? "selected" : ""}
                aria-label={`Go to question ${index + 1}${answers[question.id] ? ", answered" : ", unanswered"}`}
                onClick={() => setQuestionIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="assessment-footer-actions">
            <button
              type="button"
              onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}
              disabled={questionIndex === 0}
            >
              Previous
            </button>
            {questionIndex < assessment.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setQuestionIndex((index) => Math.min(assessment.questions.length - 1, index + 1))}
              >
                Next
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmSubmit(true)} disabled={isSaving}>
                Submit Assessment
              </button>
            )}
          </div>
          {confirmSubmit && (
            <div className="assessment-submit-confirm" role="group" aria-label="Confirm assessment submission">
              <span>
                {Object.keys(answers).length < assessment.questions.length
                  ? `${assessment.questions.length - Object.keys(answers).length} questions are unanswered. Submit anyway?`
                  : "Submit your answers and save this attempt?"}
              </span>
              <button type="button" onClick={submitAttempt} disabled={isSaving}>
                {isSaving ? "Saving attempt..." : "Confirm submission"}
              </button>
              <button type="button" onClick={() => setConfirmSubmit(false)} disabled={isSaving}>
                Continue assessment
              </button>
            </div>
          )}
          {saveError && <p className="study-error" role="alert">{saveError}</p>}
        </>
      )}
    </section>
  );
}

export default AssessmentResults;
