import type { CurrentUnit, PastPLRecord } from '../types/models';

export interface PastProjectAnalysisRow {
  projectKey: string;
  projectCode: string;
  serial: string;
  customerName: string;
  isUnique: boolean;
  duplicateProjectKeys: string[];
  similarityToCurrent: number;
}

function splitProjectKey(projectKey: string): { projectCode: string; serial: string } {
  const projectCode = projectKey.slice(0, 5);
  const underscoreIndex = projectKey.indexOf('_');
  const serial = underscoreIndex >= 0 ? projectKey.slice(underscoreIndex + 1) : '';
  return { projectCode, serial };
}

function groupByProjectKey(records: Pick<PastPLRecord, 'projectKey' | 'unitNo' | 'pl'>[]): Map<string, Map<string, string>> {
  const byProjectKey = new Map<string, Map<string, string>>();
  for (const record of records) {
    let unitMap = byProjectKey.get(record.projectKey);
    if (!unitMap) { unitMap = new Map(); byProjectKey.set(record.projectKey, unitMap); }
    unitMap.set(record.unitNo, record.pl);
  }
  return byProjectKey;
}

/** ユニットNo→PLの組み合わせを一意に表す文字列。同じ組み合わせなら同じ物件キーとして重複判定する。 */
function signatureOf(unitMap: Map<string, string>): string {
  return [...unitMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unitNo, pl]) => `${unitNo}:${pl}`).join('|');
}

/**
 * 実績PLを物件キーごとに集約し、PL組み合わせが他の物件キーと重複していないか、
 * また今回物件（PL入力済みユニット基準）とどれだけ一致するかを算出する。
 */
export function analyzePastProjects(
  pastPLRecords: Pick<PastPLRecord, 'projectKey' | 'unitNo' | 'pl'>[],
  currentUnits: Pick<CurrentUnit, 'unitNo' | 'pl'>[],
  customerByProjectCode: Map<string, string>,
): PastProjectAnalysisRow[] {
  const byProjectKey = groupByProjectKey(pastPLRecords);
  const currentByUnitNo = new Map(currentUnits.filter(unit => unit.pl).map(unit => [unit.unitNo, unit.pl]));
  const totalCurrent = currentByUnitNo.size;

  const projectKeysBySignature = new Map<string, string[]>();
  for (const [projectKey, unitMap] of byProjectKey) {
    const signature = signatureOf(unitMap);
    const group = projectKeysBySignature.get(signature);
    if (group) group.push(projectKey); else projectKeysBySignature.set(signature, [projectKey]);
  }

  const rows: PastProjectAnalysisRow[] = [];
  for (const [projectKey, unitMap] of byProjectKey) {
    const signature = signatureOf(unitMap);
    const duplicateProjectKeys = (projectKeysBySignature.get(signature) ?? [])
      .filter(key => key !== projectKey)
      .sort((a, b) => a.localeCompare(b));
    let matched = 0;
    for (const [unitNo, pl] of currentByUnitNo) { if (unitMap.get(unitNo) === pl) matched += 1; }
    const similarityToCurrent = totalCurrent ? Math.round((matched / totalCurrent) * 100) : 0;
    const { projectCode, serial } = splitProjectKey(projectKey);
    rows.push({
      projectKey,
      projectCode,
      serial,
      customerName: customerByProjectCode.get(projectCode) ?? '',
      isUnique: duplicateProjectKeys.length === 0,
      duplicateProjectKeys,
      similarityToCurrent,
    });
  }
  return rows.sort((a, b) => a.projectKey.localeCompare(b.projectKey));
}
