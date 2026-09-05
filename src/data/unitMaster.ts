export interface UnitMasterItem {
  unitNo: string;
  unitName: string;
}

/**
 * アプリで管理する固定ユニットマスター。
 * ユニットNo・ユニット名は利用者データから変更せず、今回物件ではPLだけを保存する。
 */
export const UNIT_MASTER: readonly UnitMasterItem[] = [
  { unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)' },
  { unitNo: '2', unitName: 'STEERING UNIT(R)' },
  { unitNo: '3', unitName: 'STEERING UNIT(F)' },
  { unitNo: '4', unitName: 'CORE UNIT (350X)' },
  { unitNo: '5', unitName: 'DIVERGE UNIT(R)(350X)' },
  { unitNo: '6', unitName: 'DIVERGE UNIT(F)(350X)' },
  { unitNo: '7', unitName: 'HOIST GEAR BOX(350X)' },
  { unitNo: '8', unitName: 'HOIST BASE UNIT(350X)' },
  { unitNo: '9', unitName: 'HOIST DRUM UNIT(350X)' },
  { unitNo: '10', unitName: 'HOIST SENSOR UNIT(350X)' },
  { unitNo: '11', unitName: 'CENTER FRAME' },
  { unitNo: '12', unitName: 'FRONT FRAME' },
  { unitNo: '13', unitName: 'REAR FRAME' },
  { unitNo: '14', unitName: 'FEEDER UNIT' },
  { unitNo: '15', unitName: 'LAN UNIT(350X)' },
  { unitNo: '16', unitName: 'E-84関係' },
  { unitNo: '17', unitName: 'THETA UNIT(350X)' },
  { unitNo: '18', unitName: 'LATERAL UNIT(350X)' },
  { unitNo: '19', unitName: 'LATERAL GEAR BOX (350X)' },
  { unitNo: '20', unitName: 'CRADLE(350X)' },
  { unitNo: '21', unitName: 'HAND(350X)' },
  { unitNo: '22', unitName: 'COVER' },
  { unitNo: '23', unitName: 'CLEANING NOZZLE UNIT' },
  { unitNo: '24', unitName: 'CLEANER UNIT' },
] as const;

export const UNIT_MASTER_BY_NO = new Map(UNIT_MASTER.map(unit => [unit.unitNo, unit]));