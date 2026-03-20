export const getDocumentAsync = jest.fn(async () => ({
  canceled: false,
  assets: [{ uri: '/mock-cache/backup.json', name: 'backup.json' }],
}));
