/**
 * Minimal ambient declaration for `bun:test`.
 *
 * The web tsconfig sets `types: ["vite/client"]` (owned by another agent), so the
 * Bun test globals are not part of this program — without this shim the two unit
 * test files next to it would fail `tsc` with TS2307 even though `bun test` runs
 * them fine. Delete this file if `@types/bun` is ever added to apps/web/tsconfig.json.
 */
declare module "bun:test" {
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toThrow(expected?: unknown): void;
    readonly not: Matchers;
  }

  export function describe(label: string, body: () => void): void;
  export function test(label: string, body: () => unknown): void;
  export function it(label: string, body: () => unknown): void;
  export function expect(actual: unknown): Matchers;
}
