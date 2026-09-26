// The two automatic transactional SMS events the LMS supports. Adding a
// third event means adding an entry here (plus its trigger in the relevant
// service) — nothing about wording or variables is hardcoded elsewhere.

export const SMS_EVENT_KEYS = ['SAMPLE_COLLECTED', 'REPORT_READY'] as const;
export type SmsEventKey = (typeof SMS_EVENT_KEYS)[number];

export interface SmsEventDefinition {
  key: SmsEventKey;
  label: string;
  /** Placeholders this event's template is allowed to use. */
  variables: string[];
  /**
   * Documentation/preview-only starting point shown in Settings — never
   * used as production wording unless the administrator explicitly saves
   * it (or edits it first). Runtime always reads the configured template.
   */
  exampleBody: string;
  exampleValues: Record<string, string>;
}

export const SMS_EVENT_DEFINITIONS: SmsEventDefinition[] = [
  {
    key: 'SAMPLE_COLLECTED',
    label: 'Sample Collection Confirmation',
    variables: ['patientName', 'bookingId', 'labName'],
    exampleBody:
      'Dear {{patientName}}, your samples have been collected successfully. Booking ID: {{bookingId}}.',
    exampleValues: {
      patientName: 'Ali Khan',
      bookingId: 'BK-10425',
      labName: 'Example Laboratory',
    },
  },
  {
    key: 'REPORT_READY',
    label: 'Report Ready to Collect',
    variables: ['patientName', 'bookingId', 'labName', 'trackingId'],
    exampleBody:
      'Dear {{patientName}}, your report is ready for collection. Booking ID: {{bookingId}}.',
    exampleValues: {
      patientName: 'Ali Khan',
      bookingId: 'BK-10425',
      labName: 'Example Laboratory',
      trackingId: 'TRK7X9QP2',
    },
  },
];

export function getSmsEventDefinition(key: string): SmsEventDefinition | undefined {
  return SMS_EVENT_DEFINITIONS.find((d) => d.key === key);
}
