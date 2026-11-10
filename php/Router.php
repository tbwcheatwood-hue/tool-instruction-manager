<?php
/**
 * URI classification and static path mapping for the unified server.
 */
require_once __DIR__ . '/Env.php';

final class TimRouter
{
    public const KIND_ALS_API = 'als_api';
    public const KIND_ALS_STUDIO = 'als_studio';
    public const KIND_TIM_TOOLS = 'tim_tools';
    public const KIND_TIM_PROXY = 'tim_proxy';
    public const KIND_STATIC = 'static';

    /** @return self::KIND_* */
    public static function classify(string $uri): string
    {
        $path = self::normalizeUri($uri);
        if ($path === '/api' || strpos($path, '/api/') === 0) {
            return self::KIND_ALS_API;
        }
        if ($path === '/als-studio' || strpos($path, '/als-studio/') === 0) {
            return self::KIND_ALS_STUDIO;
        }
        if ($path === '/tim/tools' || strpos($path, '/tim/tools/') === 0) {
            return self::KIND_TIM_TOOLS;
        }
        if ($path === '/tim' || strpos($path, '/tim/') === 0) {
            return self::KIND_TIM_PROXY;
        }
        return self::KIND_STATIC;
    }

    public static function normalizeUri(string $uri): string
    {
        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return '/';
        }
        if (strlen($path) > 1 && substr($path, -1) === '/') {
            $path = rtrim($path, '/');
        }
        return $path;
    }

    /** Backend path on the Node engine (leading slash), e.g. /tim/health -> /health */
    public static function timBackendPath(string $uri): string
    {
        $path = self::normalizeUri($uri);
        if ($path === '/tim') {
            return '/';
        }
        if (strpos($path, '/tim/') === 0) {
            return substr($path, 4) ?: '/';
        }
        return '/';
    }

    /**
     * Map /als-studio/... to a file under ALS_ROOT, or null if forbidden.
     */
    public static function alsStudioDiskPath(string $uri, string $alsRoot): ?string
    {
        if ($alsRoot === '' || !is_dir($alsRoot)) {
            return null;
        }
        $path = self::normalizeUri($uri);
        $suffix = '';
        if ($path === '/als-studio') {
            $suffix = '/index.html';
        } elseif (strpos($path, '/als-studio/') === 0) {
            $suffix = substr($path, strlen('/als-studio'));
            if ($suffix === '') {
                $suffix = '/index.html';
            }
        } else {
            return null;
        }

        $lower = strtolower($suffix);
        foreach (explode('/', $lower) as $part) {
            if ($part !== '' && in_array($part, ['storage', 'logs', 'tmp', 'sessions', 'tests'], true)) {
                return null;
            }
            if ($part !== '' && $part[0] === '.') {
                return null;
            }
        }
        if (substr($lower, -4) === '.php') {
            return null;
        }

        $disk = $alsRoot . str_replace('/', DIRECTORY_SEPARATOR, $suffix);
        if (is_dir($disk)) {
            $disk = rtrim($disk, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.html';
        }
        $realRoot = realpath($alsRoot);
        $real = realpath($disk);
        if ($real === false || !is_file($real)) {
            if ($suffix !== '/index.html' && is_file($alsRoot . DIRECTORY_SEPARATOR . 'index.html')) {
                return null;
            }
            return null;
        }
        if ($realRoot !== false && strpos($real, $realRoot) !== 0) {
            return null;
        }
        return $real;
    }

  /**
   * Map request URI to a file under out/, or null for SPA fallback.
   */
    public static function staticDiskPath(string $uri, string $outDir): ?string
    {
        if (!is_dir($outDir)) {
            return null;
        }
        $path = self::normalizeUri($uri);
        if ($path === '/') {
            $index = $outDir . DIRECTORY_SEPARATOR . 'index.html';
            return is_file($index) ? $index : null;
        }
        $rel = ltrim(str_replace('/', DIRECTORY_SEPARATOR, $path), DIRECTORY_SEPARATOR);
        $disk = $outDir . DIRECTORY_SEPARATOR . $rel;
        if (is_dir($disk)) {
            $disk = rtrim($disk, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.html';
        }
        $realOut = realpath($outDir);
        $real = realpath($disk);
        if ($real === false || !is_file($real)) {
            return null;
        }
        if ($realOut !== false && strpos($real, $realOut) !== 0) {
            return null;
        }
        return $real;
    }

    public static function spaFallback(string $outDir): ?string
    {
        $index = $outDir . DIRECTORY_SEPARATOR . 'index.html';
        return is_file($index) ? $index : null;
    }

    public static function contentTypeForPath(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $types = [
            'html' => 'text/html; charset=utf-8',
            'js' => 'text/javascript; charset=utf-8',
            'mjs' => 'text/javascript; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'map' => 'application/json; charset=utf-8',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'txt' => 'text/plain; charset=utf-8',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
        ];
        return isset($types[$ext]) ? $types[$ext] : 'application/octet-stream';
    }

    public static function sendFile(string $path): void
    {
        header('Content-Type: ' . self::contentTypeForPath($path));
        header('X-Content-Type-Options: nosniff');
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($ext === 'html' || $ext === 'htm') {
            header('Cache-Control: no-store, no-cache, must-revalidate');
        } elseif ($ext === 'js' || $ext === 'css') {
            header('Cache-Control: no-cache, must-revalidate');
        }
        readfile($path);
    }
}
