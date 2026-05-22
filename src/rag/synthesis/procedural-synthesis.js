const { buildProceduralSystemPrompt } = require("../prompts");

function buildProceduralMessages({ equipment, retrievalContext, history = [], question }) {
  return [
    {
      role: "system",
      content: buildProceduralSystemPrompt(equipment, retrievalContext),
    },
    ...history,
    {
      role: "user",
      content: question,
    },
  ];
}

module.exports = {
  buildProceduralMessages,
};
