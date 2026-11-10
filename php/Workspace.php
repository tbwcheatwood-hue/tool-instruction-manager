<?php
/**
 * Path confinement for tool and file operations (matches engine/sandbox.ts intent).
 */
final class TimWorkspace
{
    public static function resolveInside(string $root, string $requestPath): string
    {
        $rootAbs = realpath($root);
        if ($rootAbs === false) {
            $rootAbs = $root;
            @mkdir($rootAbs, 0777, true);
            $rootAbs = realpath($rootAbs) ?: $root;
        }
        $target = $rootAbs . DIRECTORY_SEPARATOR . ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $requestPath), DIRECTORY_SEPARATOR);
        if ($requestPath === '' || $requestPath === '.') {
            $target = $rootAbs;
        }
        $normalized = realpath($target);
        if ($normalized === false) {
            $prefix = $rootAbs . DIRECTORY_SEPARATOR;
            if (strpos($target, $prefix) !== 0 && $target !== $rootAbs) {
                throw new RuntimeException('Path leaves the workspace');
            }
            return $target;
        }
        $prefix = $rootAbs . DIRECTORY_SEPARATOR;
        if ($normalized !== $rootAbs && strpos($normalized, $prefix) !== 0) {
            throw new RuntimeException('Path leaves the workspace');
        }
        return $normalized;
    }
}
