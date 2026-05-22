class TraceModel {
  constructor(seed = {}) {
    this.startedAt = Date.now();
    this.router = {};
    this.retrieval = {};
    this.decision = {};
    this.llm = {};
    this.guardrails = {};
    this.scores = {};
    this.answerDelivery = null;
    this.meta = seed;
  }

  setRouter(data) {
    this.router = { ...data };
  }

  setRetrieval(data) {
    this.retrieval = { ...data };
  }

  setDecision(data) {
    this.decision = { ...data };
  }

  setLlm(data) {
    this.llm = { ...data };
  }

  setGuardrails(data) {
    this.guardrails = { ...data };
  }

  setScores(data) {
    this.scores = { ...data };
  }

  setAnswerDelivery(data) {
    this.answerDelivery = { ...(this.answerDelivery || {}), ...data };
  }

  build(extra = {}) {
    return {
      router: this.router,
      retrieval: this.retrieval,
      decision: this.decision,
      llm: this.llm,
      guardrails: this.guardrails,
      scores: this.scores,
      answerDelivery: this.answerDelivery,
      latency: {
        totalMs: Date.now() - this.startedAt,
      },
      ...extra,
    };
  }
}

module.exports = {
  TraceModel,
};
