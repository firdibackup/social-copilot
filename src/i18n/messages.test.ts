import {describe, expect, it} from 'vitest';
import {MESSAGE_NAMESPACES, loadMessages} from './messages';

describe('message catalogs', () => {
  it('loads the same complete namespace set for both locales', async () => {
    const [id, en] = await Promise.all([loadMessages('id'), loadMessages('en')]);
    const expected = [...MESSAGE_NAMESPACES].sort();

    expect(Object.keys(id).sort()).toEqual(expected);
    expect(Object.keys(en).sort()).toEqual(expected);
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
  });
});
