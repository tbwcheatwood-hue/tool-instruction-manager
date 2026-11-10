<?php
/**
 * Allowlisted local tools (discoverable registry; no arbitrary code execution).
 */
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Workspace.php';

final class TimTools
{
    private const MAX_LIST = 200;
    private const MAX_READ = 65536;
    private const MAX_ECHO = 4000;
    private const MAX_JSON = 8192;

    public static function registry(): array
    {
        return [
            [
                'id' => 'workspace_list',
                'name' => 'Workspace list',
                'description' => 'List files and directories in the T.I.M. workspace.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'path' => ['type' => 'string', 'description' => 'Relative path under workspace (default ".")'],
                    ],
                ],
            ],
            [
                'id' => 'workspace_read',
                'name' => 'Workspace read',
                'description' => 'Read a text file from the workspace (max 64KB).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'path' => ['type' => 'string', 'description' => 'Relative file path'],
                    ],
                    'required' => ['path'],
                ],
            ],
            [
                'id' => 'echo',
                'name' => 'Echo',
                'description' => 'Return the message argument (for pipeline checks).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'message' => ['type' => 'string'],
                    ],
                    'required' => ['message'],
                ],
            ],
        ];
    }

    public static function handle(string $method, string $uri, string $rawBody): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        $token = TimEnv::readLocalToken();
        if ($token !== '') {
            $supplied = (string)($_SERVER['HTTP_X_TIM_TOKEN'] ?? '');
            if (!hash_equals($token, $supplied)) {
                http_response_code(401);
                echo json_encode(['ok' => false, 'error' => 'Missing or invalid X-Tim-Token']);
                return;
            }
        }

        if ($method === 'GET' && ($uri === '/tim/tools' || $uri === '/tim/tools/')) {
            echo json_encode(['ok' => true, 'tools' => self::registry()], JSON_UNESCAPED_SLASHES);
            return;
        }

        if ($method === 'POST' && preg_match('#^/tim/tools/([a-z0-9_]+)/invoke$#', $uri, $m)) {
            $id = $m[1];
            $args = json_decode($rawBody, true);
            if (!is_array($args)) {
                $args = [];
            }
            try {
                $output = self::invoke($id, $args);
                $json = json_encode(['ok' => true, 'output' => $output], JSON_UNESCAPED_SLASHES);
                if ($json === false || strlen($json) > self::MAX_JSON) {
                    http_response_code(413);
                    echo json_encode(['ok' => false, 'error' => 'Output too large']);
                    return;
                }
                echo $json;
            } catch (Throwable $e) {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
            }
            return;
        }

        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Not found']);
    }

    public static function invoke(string $id, array $args): string
    {
        $workspace = TimEnv::workspaceDir();
        @mkdir($workspace, 0777, true);

        if ($id === 'echo') {
            $msg = isset($args['message']) ? (string)$args['message'] : '';
            if (strlen($msg) > self::MAX_ECHO) {
                throw new RuntimeException('Message too long');
            }
            return $msg;
        }

        if ($id === 'workspace_list') {
            $rel = isset($args['path']) ? (string)$args['path'] : '.';
            $dir = TimWorkspace::resolveInside($workspace, $rel);
            if (!is_dir($dir)) {
                throw new RuntimeException('Not a directory');
            }
            $entries = @scandir($dir);
            if (!is_array($entries)) {
                throw new RuntimeException('Could not list directory');
            }
            $lines = [];
            foreach ($entries as $name) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                $full = $dir . DIRECTORY_SEPARATOR . $name;
                $lines[] = (is_dir($full) ? 'd' : 'f') . ' ' . $name;
                if (count($lines) >= self::MAX_LIST) {
                    $lines[] = '... truncated';
                    break;
                }
            }
            return $lines === [] ? '(empty)' : implode("\n", $lines);
        }

        if ($id === 'workspace_read') {
            $rel = isset($args['path']) ? (string)$args['path'] : '';
            if ($rel === '') {
                throw new RuntimeException('path is required');
            }
            $file = TimWorkspace::resolveInside($workspace, $rel);
            if (!is_file($file)) {
                throw new RuntimeException('Not a file');
            }
            $size = filesize($file);
            if ($size !== false && $size > self::MAX_READ) {
                throw new RuntimeException('File is larger than 64KB');
            }
            return (string)file_get_contents($file);
        }

        throw new RuntimeException('Unknown tool');
    }
}
