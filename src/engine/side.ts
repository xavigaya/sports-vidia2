export type Side = 'H' | 'A'; // H = local (home), A = visitant (away)

export const other = (s: Side): Side => (s === 'H' ? 'A' : 'H');
