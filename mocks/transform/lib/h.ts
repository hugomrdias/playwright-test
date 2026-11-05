export function h(type: string, props: Record<string, unknown> | null) {
  return { type, props: props ?? {} }
}
