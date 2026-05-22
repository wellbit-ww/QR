const { buildTroubleshootingSystemPrompt } = require("../prompts");

function buildDiagnosticClarification(symptoms = []) {
  const questions = [];
  if (!symptoms.includes("door")) {
    questions.push("дверь шкафа открыта или плотно закрыта?");
  }
  if (!symptoms.includes("indicator")) {
    questions.push("мигает или горит какой-либо индикатор?");
  }
  if (!symptoms.includes("humidity")) {
    questions.push("связано ли поведение с влажностью или режимом осушения?");
  }
  if (!symptoms.includes("ethernet")) {
    questions.push("есть ли сообщение об ошибке или проблема связи?");
  }

  const selected = questions.slice(0, 4);
  if (!selected.length) {
    return "Уточните симптом: что именно отображается на панели и в каком режиме работает шкаф?";
  }
  return ["Уточните:", ...selected.map((q, idx) => `${idx + 1}. ${q}`)].join("\n");
}

function buildTroubleshootingMessages({ equipment, retrievalContext, history = [], question }) {
  return [
    {
      role: "system",
      content: buildTroubleshootingSystemPrompt(equipment, retrievalContext),
    },
    ...history,
    {
      role: "user",
      content: question,
    },
  ];
}

module.exports = {
  buildTroubleshootingMessages,
  buildDiagnosticClarification,
};
