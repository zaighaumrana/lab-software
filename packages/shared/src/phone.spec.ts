import { normalizePakistaniMobile } from './phone';

describe('normalizePakistaniMobile', () => {
  it('normalizes a local-format number', () => {
    expect(normalizePakistaniMobile('03001234567')).toBe('923001234567');
  });

  it('normalizes a +92-prefixed number', () => {
    expect(normalizePakistaniMobile('+923001234567')).toBe('923001234567');
  });

  it('normalizes an 0092-prefixed number', () => {
    expect(normalizePakistaniMobile('00923001234567')).toBe('923001234567');
  });

  it('leaves an already-normalized number as-is', () => {
    expect(normalizePakistaniMobile('923001234567')).toBe('923001234567');
  });

  it('rejects invalid numbers', () => {
    expect(normalizePakistaniMobile('12345')).toBeNull();
    expect(normalizePakistaniMobile('')).toBeNull();
    expect(normalizePakistaniMobile(undefined)).toBeNull();
    expect(normalizePakistaniMobile('0400123456')).toBeNull(); // not a 03xxxxxxxxx mobile
  });
});
