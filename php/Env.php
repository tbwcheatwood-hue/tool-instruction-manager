<?php
/**
 * Consolidated runtime paths from environment (no secrets).
 */
final class TimEnv
{
    public static function timRoot(): string
    {
        $v = getenv('TIM_ROOT');
        if (is_string($v) && $v !== '') {
            return rtrim($v, '/\\');
        }
        return dirname(__DIR__);
    }

    public static function alsRoot(): string
    {
        $v = getenv('ALS_ROOT');
        if (is_string($v) && trim($v) !== '') {
            return rtrim(trim($v), '/\\');
        }
        $home = getenv('HOME');
        if (is_string($home) && $home !== '') {
            $guess = $home . '/Downloads/Autonomous-master';
            if (is_dir($guess)) {
                return $guess;
            }
        }
        return '';
    }

    public static function timEnginePort(): int
    {
        $v = getenv('TIM_ENGINE_PORT');
        if (is_string($v) && preg_match('/^\d+$/', trim($v))) {
            return max(1, min(65535, (int)trim($v)));
        }
        return 8791;
    }

    public static function timHttpPort(): int
    {
        $v = getenv('TIM_HTTP_PORT');
        if (is_string($v) && preg_match('/^\d+$/', trim($v))) {
            return max(1, min(65535, (int)trim($v)));
        }
        return 8070;
    }

    public static function staticOutDir(): string
    {
        return self::timRoot() . '/out';
    }

    public static function workspaceDir(): string
    {
        $v = getenv('TIM_WORKSPACE');
        if (is_string($v) && trim($v) !== '') {
            return rtrim(trim($v), '/\\');
        }
        return self::timRoot() . '/data/workspace';
    }

    public static function dataDir(): string
    {
        $v = getenv('TIM_DATA');
        if (is_string($v) && trim($v) !== '') {
            return rtrim(trim($v), '/\\');
        }
        return self::timRoot() . '/data';
    }

    public static function localTokenPath(): string
    {
        return self::dataDir() . '/.tim-local-token';
    }

    public static function readLocalToken(): string
    {
        $path = self::localTokenPath();
        if (!is_file($path)) {
            return '';
        }
        return trim((string)file_get_contents($path));
    }
}
