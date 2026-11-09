import path from "node:path";

export function resolveInside(root: string, requestPath: string): string {
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, requestPath || ".");
  const relative = path.relative(rootAbs, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path leaves the workspace");
  }
  return target;
}
