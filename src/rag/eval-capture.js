/**
 * Request-scoped eval RAG trace capture (set from server when X-Sova-Eval-Trace: 1).
 */
let activeEvalCapture = false;

function setEvalCaptureRagTrace(enabled) {
  activeEvalCapture = Boolean(enabled);
}

function isEvalCaptureRagTraceEnabled() {
  if (activeEvalCapture) {
    return true;
  }
  return String(process.env.EVAL_CAPTURE_RAG_TRACE || "").trim() === "1";
}

function runWithEvalCaptureRagTrace(enabled, fn) {
  const prev = activeEvalCapture;
  activeEvalCapture = Boolean(enabled);
  try {
    return fn();
  } finally {
    activeEvalCapture = prev;
  }
}

async function runWithEvalCaptureRagTraceAsync(enabled, fn) {
  const prev = activeEvalCapture;
  activeEvalCapture = Boolean(enabled);
  try {
    return await fn();
  } finally {
    activeEvalCapture = prev;
  }
}

module.exports = {
  setEvalCaptureRagTrace,
  isEvalCaptureRagTraceEnabled,
  runWithEvalCaptureRagTrace,
  runWithEvalCaptureRagTraceAsync,
};
