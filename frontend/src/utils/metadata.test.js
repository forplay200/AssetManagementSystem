import { compactMetadata } from './metadata';

test('trims and removes empty initial metadata values', () => {
  expect(compactMetadata({ description: ' Hero sprite ', category: ' ', project: 'RPG' })).toEqual({ description: 'Hero sprite', project: 'RPG' });
});
