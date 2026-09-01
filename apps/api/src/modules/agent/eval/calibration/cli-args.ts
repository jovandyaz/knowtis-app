export function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index !== -1 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : undefined;
}
