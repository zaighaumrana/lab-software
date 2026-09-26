import { calculateSmsSegments } from './sms-segmentation';

describe('calculateSmsSegments', () => {
  it('treats a short GSM-7 message as a single SMS', () => {
    const result = calculateSmsSegments('Dear Ali Khan, your samples have been collected.');
    expect(result.type).toBe('text');
    expect(result.parts).toBe(1);
    expect(result.capacity).toBe(160);
  });

  it('is exactly 1 part at the 160-character boundary', () => {
    expect(calculateSmsSegments('a'.repeat(160)).parts).toBe(1);
  });

  it('becomes 2 parts at 161 characters', () => {
    const result = calculateSmsSegments('a'.repeat(161));
    expect(result.parts).toBe(2);
    expect(result.capacity).toBe(306);
  });

  it('matches the spec example: 324 chars -> 3 SMS, 135 remaining', () => {
    const result = calculateSmsSegments('a'.repeat(324));
    expect(result.parts).toBe(3);
    expect(result.capacity).toBe(459);
    expect(result.remaining).toBe(135);
  });

  it('counts GSM extension-table characters as 2 septets', () => {
    // "€" is in the GSM extension table (costs 2 septets), so 80 of them
    // should push a message from well under 160 units to over it.
    const result = calculateSmsSegments('€'.repeat(85));
    expect(result.type).toBe('text');
    expect(result.units).toBe(170);
    expect(result.parts).toBe(2);
  });

  it('detects Urdu/Arabic content as Unicode', () => {
    const result = calculateSmsSegments('آپ کا نمونہ لے لیا گیا ہے۔');
    expect(result.type).toBe('unicode');
  });

  it('is exactly 1 part at the 70-unit Unicode boundary', () => {
    expect(calculateSmsSegments('ا'.repeat(70)).parts).toBe(1);
  });

  it('becomes 2 parts at 71 Unicode units', () => {
    const result = calculateSmsSegments('ا'.repeat(71));
    expect(result.parts).toBe(2);
    expect(result.capacity).toBe(134);
  });
});
