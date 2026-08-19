const TEXT_FIELDS = ['categoria', 'projeto', 'uf', 'regiao', 'etapa', 'status', 'modalidade', 'municipio', 'situacao'];
const NUMBER_FIELDS = ['capex', 'opex', 'populacao'];

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const finiteNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function countBy(projects, field) {
  const counts = new Map();
  for (const project of projects) {
    const value = cleanText(project[field]) || 'Não informado';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')));
}

export function auditPortfolio(projects, expectedTotal = 144) {
  if (!Array.isArray(projects)) throw new TypeError('data.json deve conter uma lista de projetos.');

  const identifiers = projects.map((project, index) => cleanText(project.numero) || `SEM-NUMERO-${index + 1}`);
  const occurrences = new Map();
  for (const identifier of identifiers) occurrences.set(identifier, (occurrences.get(identifier) || 0) + 1);
  const duplicateIdentifiers = [...occurrences.entries()].filter(([, count]) => count > 1).map(([identifier]) => identifier);
  const missingNumberIndexes = identifiers.map((id, index) => id.startsWith('SEM-NUMERO-') ? index + 1 : null).filter(Boolean);
  const audit = {
    expected_total: expectedTotal,
    received_total: projects.length,
    unique_identifiers: occurrences.size,
    duplicate_identifiers: duplicateIdentifiers,
    rows_without_number: missingNumberIndexes,
    complete: projects.length === expectedTotal && occurrences.size === expectedTotal && duplicateIdentifiers.length === 0 && missingNumberIndexes.length === 0
  };

  return {
    audit,
    totals: Object.fromEntries(NUMBER_FIELDS.map(field => [field, projects.reduce((sum, project) => sum + finiteNumber(project[field]), 0)])),
    informed: Object.fromEntries(NUMBER_FIELDS.map(field => [field, projects.filter(project => finiteNumber(project[field]) > 0).length])),
    distributions: Object.fromEntries(['categoria', 'uf', 'regiao', 'etapa', 'status', 'modalidade'].map(field => [field, countBy(projects, field)])),
    field_gaps: Object.fromEntries(TEXT_FIELDS.map(field => [field, projects.filter(project => !cleanText(project[field])).length])),
    manifest: projects.map((project, index) => ({
      indice: index + 1, numero: cleanText(project.numero), projeto: cleanText(project.projeto),
      categoria: cleanText(project.categoria), uf: cleanText(project.uf), regiao: cleanText(project.regiao),
      etapa: cleanText(project.etapa), status: cleanText(project.status), modalidade: cleanText(project.modalidade),
      capex: finiteNumber(project.capex), opex: finiteNumber(project.opex), populacao: finiteNumber(project.populacao),
      situacao: cleanText(project.situacao)
    }))
  };
}
