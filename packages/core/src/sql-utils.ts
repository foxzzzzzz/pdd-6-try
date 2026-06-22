export function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
