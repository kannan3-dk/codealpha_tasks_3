/**
 * Consistent error formatter for all Supabase database and auth calls.
 * Enforces requirement:
 * "Consistent error handling for every Supabase call; map messages containing 'row-level security' to 'You do not have permission to do that.'"
 */
export function formatSupabaseError(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred.'
): string {
  if (!error) return fallbackMessage;

  let msg = '';
  if (typeof error === 'string') {
    msg = error;
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    msg = errObj.message || errObj.error_description || errObj.details || errObj.hint || '';
  }

  const lower = msg.toLowerCase();

  // Map messages containing 'row-level security' to 'You do not have permission to do that.'
  if (
    lower.includes('row-level security') ||
    lower.includes('row level security') ||
    lower.includes('violates row-level security policy') ||
    lower.includes('permission denied')
  ) {
    return 'You do not have permission to do that.';
  }

  // Specific requirement: 'Assignee must be a member of the project'
  if (
    lower.includes('assignee must be a member of the project') ||
    lower.includes('assignee must be a member')
  ) {
    return 'Assignee must be a member of the project';
  }

  return msg || fallbackMessage;
}
