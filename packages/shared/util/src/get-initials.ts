export function getInitials(name: string, maxLength = 2): string {
  return name
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, maxLength);
}
