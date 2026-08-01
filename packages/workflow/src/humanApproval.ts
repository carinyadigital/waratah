/**
 * Shared gate for "does this name look like a person, not an agent?" — used
 * wherever a consequential write (queue promotion, send approval) requires a
 * named human. Errs toward refusing: an empty name is not a person either.
 */
export const looksLikeAgent = (name: string): boolean =>
  /^$|agent|bot|studio|planner|analyst|monitor|distributor|desk|-qa$|^ci$/i.test(name.trim());
