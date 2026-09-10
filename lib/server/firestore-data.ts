export function withoutUndefinedProperties<T extends object>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, property]) => property !== undefined),
  ) as Partial<T>;
}
