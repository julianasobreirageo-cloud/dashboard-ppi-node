const EMPTY_SOURCE_PATTERNS = [
  /sem situa[cç][aã]o atual/i,
  /situa[cç][aã]o atual (?:n[aã]o|nem) detalhad/i,
  /n[aã]o apresenta situa[cç][aã]o/i,
  /situa[cç][aã]o do projeto\s*[:\-–—]?\s*$/i
];

const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function classifyRecord(record = {}) {
  const situation = compact(record.situacao);
  if (!situation) return { classification: 'CAMPO_VAZIO', candidate_status: 'Não iniciado', reason: 'Campo situação sem conteúdo.' };
  if (EMPTY_SOURCE_PATTERNS.some(pattern => pattern.test(situation))) {
    return { classification: 'FONTE_SEM_DETALHE', candidate_status: 'Não iniciado', reason: 'O texto informa que a fonte não apresenta situação atual.' };
  }
  return { classification: 'COM_SITUACAO', candidate_status: '', reason: 'Há descrição de situação.' };
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ccedil;/gi, 'ç').replace(/&atilde;/gi, 'ã')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú')
    .replace(/\s+/g, ' ').trim();
}

export function extractSituationFromHtml(html) {
  const text = htmlToText(html);
  const label = /situa[cç][aã]o (?:do projeto|atual)/i.exec(text);
  if (!label) return { situation: '', classification: 'CAMPO_NAO_LOCALIZADO', reason: 'O rótulo de situação não foi localizado na página.' };
  const after = text.slice(label.index + label[0].length).replace(/^\s*[:\-–—]\s*/, '');
  const stop = /\b(?:cronograma|investimento|capex|opex|popula[cç][aã]o|documentos|galeria|contato)\b/i.exec(after);
  const situation = compact(after.slice(0, stop ? stop.index : 500));
  if (!situation || situation.length < 3) return { situation: '', classification: 'CAMPO_VAZIO', reason: 'O rótulo existe, mas não há conteúdo útil após ele.' };
  return { situation, classification: 'COM_SITUACAO', reason: 'Há descrição de situação na página.' };
}

export function validatePpiUrl(value) {
  const url = new URL(String(value).trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Somente URLs HTTP(S) são aceitas.');
  const host = url.hostname.toLowerCase();
  if (host !== 'ppi.gov.br' && !host.endsWith('.ppi.gov.br')) throw new Error('Apenas páginas oficiais do domínio ppi.gov.br são permitidas.');
  return url;
}

export async function verifyPpiPage(value, fetchImpl = fetch) {
  const url = validatePpiUrl(value);
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Verificador-Situacao-PPI/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Página respondeu HTTP ${response.status}.`);
  const result = extractSituationFromHtml(await response.text());
  return { url: url.href, ...result, candidate_status: result.classification === 'COM_SITUACAO' ? '' : 'Não iniciado' };
}
