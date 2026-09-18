const catalog = require("../equipment/catalogs/sdb151-nm");
const { sectionHintsFromCatalog, directContextHintsFromCatalog } = require("./catalog-engine");

function sectionHintsForSdb151nmMessage(message) {
  return sectionHintsFromCatalog(catalog, message);
}

function directContextHintsForSdb151nmMessage(message) {
  return directContextHintsFromCatalog(catalog, message);
}

module.exports = {
  directContextHintsForSdb151nmMessage,
  sectionHintsForSdb151nmMessage,
};
