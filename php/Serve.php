<?php
/**
 * Unified T.I.M. + ALS front controller. Run: php -S host:port -t TIM_ROOT php/Serve.php
 */
if (PHP_SAPI === 'cli') {
    $cmd = isset($argv[1]) ? $argv[1] : '--help';
    if ($cmd === '--check') {
        require_once __DIR__ . '/Env.php';
        $als = TimEnv::alsRoot();
        echo 'TIM_ROOT=' . TimEnv::timRoot() . "\n";
        echo 'ALS_ROOT=' . ($als !== '' ? $als : '(missing)') . "\n";
        echo 'OUT=' . (is_file(TimEnv::staticOutDir() . '/index.html') ? 'yes' : 'no') . "\n";
        if ($als !== '' && is_file($als . '/serve.php')) {
            passthru(PHP_BINARY . ' ' . escapeshellarg($als . '/serve.php') . ' --check 2>&1', $rc);
            exit($rc);
        }
        fwrite(STDERR, "ALS_ROOT not found. Set ALS_ROOT.\n");
        exit(3);
    }
    if ($cmd === '--help') {
        echo "Usage: php Serve.php --check\n";
        exit(0);
    }
    fwrite(STDERR, "Unknown command. Use --check or run under php -S.\n");
    exit(1);
}

require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Router.php';
require_once __DIR__ . '/TimProxy.php';
require_once __DIR__ . '/TimTools.php';

$uri = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '/';
$method = isset($_SERVER['REQUEST_METHOD']) ? (string)$_SERVER['REQUEST_METHOD'] : 'GET';

$kind = TimRouter::classify($uri);

if ($kind === TimRouter::KIND_ALS_API) {
    $als = TimEnv::alsRoot();
    $api = $als . '/api/index.php';
    if (!is_file($api)) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'ALS api not found; set ALS_ROOT']);
        return true;
    }
    require $api;
    return true;
}

if ($kind === TimRouter::KIND_ALS_STUDIO) {
    $disk = TimRouter::alsStudioDiskPath($uri, TimEnv::alsRoot());
    if ($disk === null) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo "Not found\n";
        return true;
    }
    TimRouter::sendFile($disk);
    return true;
}

if ($kind === TimRouter::KIND_TIM_TOOLS) {
    $raw = file_get_contents('php://input');
    TimTools::handle($method, TimRouter::normalizeUri($uri), $raw === false ? '' : $raw);
    return true;
}

if ($kind === TimRouter::KIND_TIM_PROXY) {
    if ($method === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        http_response_code(204);
        return true;
    }
    $raw = file_get_contents('php://input');
    $backend = TimRouter::timBackendPath($uri);
    $resp = TimProxy::forward($method, $backend, $raw === false ? '' : $raw, $_SERVER);
    http_response_code($resp['code']);
    foreach ($resp['headers'] as $h) {
        header($h, false);
    }
    if (!self_has_content_type($resp['headers'])) {
        header('Content-Type: application/json');
    }
    echo $resp['body'];
    return true;
}

$outDir = TimEnv::staticOutDir();
$disk = TimRouter::staticDiskPath($uri, $outDir);
if ($disk !== null) {
    TimRouter::sendFile($disk);
    return true;
}

$spa = TimRouter::spaFallback($outDir);
if ($spa !== null && $method === 'GET') {
    TimRouter::sendFile($spa);
    return true;
}

http_response_code(404);
header('Content-Type: text/plain');
echo "Not found\n";
return true;

function self_has_content_type(array $headers): bool
{
    foreach ($headers as $h) {
        if (stripos($h, 'Content-Type:') === 0) {
            return true;
        }
    }
    return false;
}
