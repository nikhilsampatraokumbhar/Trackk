export const cacheDirectory = '/mock-cache/';
export const EncodingType = { UTF8: 'utf8' };

export const getInfoAsync = jest.fn(async () => ({ exists: false }));
export const makeDirectoryAsync = jest.fn(async () => {});
export const deleteAsync = jest.fn(async () => {});
export const copyAsync = jest.fn(async () => {});
export const writeAsStringAsync = jest.fn(async () => {});
export const readAsStringAsync = jest.fn(async () => '');

export default {
  cacheDirectory,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  copyAsync,
  writeAsStringAsync,
  readAsStringAsync,
};
