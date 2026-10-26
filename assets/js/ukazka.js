// Statická ukázka: bez PHP se poptávka ani objednávka neodešle.
document.addEventListener("submit", (e) => {
  if (!e.target.matches("[data-form], [data-order]")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  alert("Tohle je ukázka webu. Poptávky a objednávky začnou chodit po spuštění na hostingu s PHP.");
}, true);
