const { buildReasoningSystemPrompt } = require("../prompts");
const { formatContextForPrompt } = require("../retrieval");

function buildCausalContext(causalChain = []) {
  if (!causalChain.length) {
    return "";
  }
  return formatContextForPrompt(causalChain.slice(0, 6));
}

function buildReasoningMessages({
  equipment,
  retrievalContext,
  causalChain = [],
  history = [],
  question,
}) {
  return [
    {
      role: "system",
      content: buildReasoningSystemPrompt(equipment, retrievalContext, buildCausalContext(causalChain)),
    },
    ...history,
    {
      role: "user",
      content: question,
    },
  ];
}

module.exports = {
  buildReasoningMessages,
  buildCausalContext,
};
