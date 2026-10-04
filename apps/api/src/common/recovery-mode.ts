/** Historical restores must never automatically replay external side effects. */
export function recoveryMode(): boolean {
  return process.env.LABFLOW_RECOVERY_MODE === 'true';
}
