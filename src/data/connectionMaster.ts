import type { Connection } from '../types/models';

/**
 * アプリで管理する固定接続マスター。
 * 接続No・ユニットNo_A・ユニットNo_Bは利用者データとして保存しない。
 */
export const CONNECTION_MASTER: readonly Connection[] = [
  { id: 1, connectionNo: '1', unitNoA: '1', unitNoB: '2' },
  { id: 2, connectionNo: '2', unitNoA: '1', unitNoB: '3' },
  { id: 3, connectionNo: '3', unitNoA: '2', unitNoB: '4' },
  { id: 4, connectionNo: '4', unitNoA: '2', unitNoB: '5' },
  { id: 5, connectionNo: '5', unitNoA: '2', unitNoB: '11' },
  { id: 6, connectionNo: '6', unitNoA: '3', unitNoB: '4' },
  { id: 7, connectionNo: '7', unitNoA: '3', unitNoB: '5' },
  { id: 8, connectionNo: '8', unitNoA: '3', unitNoB: '11' },
  { id: 9, connectionNo: '9', unitNoA: '7', unitNoB: '8' },
  { id: 10, connectionNo: '10', unitNoA: '7', unitNoB: '9' },
  { id: 11, connectionNo: '11', unitNoA: '7', unitNoB: '10' },
  { id: 12, connectionNo: '12', unitNoA: '8', unitNoB: '9' },
  { id: 13, connectionNo: '13', unitNoA: '8', unitNoB: '10' },
  { id: 14, connectionNo: '14', unitNoA: '8', unitNoB: '17' },
  { id: 15, connectionNo: '15', unitNoA: '8', unitNoB: '22' },
  { id: 16, connectionNo: '16', unitNoA: '9', unitNoB: '21' },
  { id: 17, connectionNo: '17', unitNoA: '10', unitNoB: '21' },
  { id: 18, connectionNo: '18', unitNoA: '11', unitNoB: '12' },
  { id: 19, connectionNo: '19', unitNoA: '11', unitNoB: '13' },
  { id: 20, connectionNo: '20', unitNoA: '11', unitNoB: '18' },
  { id: 21, connectionNo: '21', unitNoA: '11', unitNoB: '19' },
  { id: 22, connectionNo: '22', unitNoA: '11', unitNoB: '22' },
  { id: 23, connectionNo: '23', unitNoA: '12', unitNoB: '20' },
  { id: 24, connectionNo: '24', unitNoA: '12', unitNoB: '22' },
  { id: 25, connectionNo: '25', unitNoA: '13', unitNoB: '20' },
  { id: 26, connectionNo: '26', unitNoA: '13', unitNoB: '22' },
  { id: 27, connectionNo: '27', unitNoA: '17', unitNoB: '18' },
  { id: 28, connectionNo: '28', unitNoA: '18', unitNoB: '19' },
  { id: 29, connectionNo: '29', unitNoA: '21', unitNoB: '22' },
  { id: 30, connectionNo: '30', unitNoA: '23', unitNoB: '2' },
  { id: 31, connectionNo: '31', unitNoA: '23', unitNoB: '5' },
  { id: 32, connectionNo: '32', unitNoA: '23', unitNoB: '24' },
  { id: 33, connectionNo: '33', unitNoA: '24', unitNoB: '2' },
  { id: 34, connectionNo: '34', unitNoA: '24', unitNoB: '12' },
  { id: 35, connectionNo: '35', unitNoA: '24', unitNoB: '13' },
  { id: 36, connectionNo: '36', unitNoA: '24', unitNoB: '22' },
] as const;