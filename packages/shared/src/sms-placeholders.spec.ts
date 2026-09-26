import {
  validatePlaceholders,
  renderLocalTemplate,
  toSendPkWording,
  buildSendPkVariables,
  extractPlaceholders,
} from './sms-placeholders';

describe('sms-placeholders', () => {
  it('extracts placeholders in order, de-duplicated', () => {
    expect(extractPlaceholders('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('validates whitelisted placeholders as valid', () => {
    const result = validatePlaceholders('Dear {{patientName}}, Booking ID: {{bookingId}}.');
    expect(result.valid).toBe(true);
    expect(result.unknown).toEqual([]);
  });

  it('flags unknown placeholders instead of silently dropping them', () => {
    const result = validatePlaceholders('Dear {{patientName}}, {{somethingRandom}}');
    expect(result.valid).toBe(false);
    expect(result.unknown).toEqual(['somethingRandom']);
  });

  it('renders the local template with real values', () => {
    const rendered = renderLocalTemplate('Dear {{patientName}}, ID: {{bookingId}}.', {
      patientName: 'Ali Khan',
      bookingId: 'BK-10425',
    });
    expect(rendered).toBe('Dear Ali Khan, ID: BK-10425.');
  });

  it('converts local placeholders to SENDPK #variable# syntax', () => {
    const converted = toSendPkWording(
      'Dear {{patientName}}, your samples for booking {{bookingId}} have been collected.',
    );
    expect(converted).toBe(
      'Dear #patient_name#, your samples for booking #booking_id# have been collected.',
    );
  });

  it('builds the SENDPK JSON variables payload keyed by SENDPK variable names', () => {
    const vars = buildSendPkVariables('Dear {{patientName}}, {{bookingId}}', {
      patientName: 'Ali Khan',
      bookingId: 'BK-10425',
    });
    expect(vars).toEqual({ patient_name: 'Ali Khan', booking_id: 'BK-10425' });
  });
});
