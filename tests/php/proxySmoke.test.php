<?php

declare(strict_types=1);

/**
 * Optional integration smoke: health check via TimProxy when engine is listening.
 * Skips gracefully if nothing is on TIM_ENGINE_PORT.
 */

require_once dirname(__DIR__, 2) . '/php/Env.php';
require_once dirname(__DIR__, 2) . '/php/TimProxy.php';

$port = TimEnv::timEnginePort();
$host = '127.0.0.1';

$errno = 0;
$errstr = '';
$sock = @fsockopen($host, $port, $errno, $errstr, 0.2);
if ($sock === false) {
    echo "SKIP proxy smoke — no listener on {$host}:{$port}\n";
    exit(0);
}
fclose($sock);

$res = TimProxy::forward('GET', '/health', '', []);
if (($res['code'] ?? 0) !== 200) {
    fwrite(STDERR, "FAIL: HTTP {$res['code']}\n");
    exit(1);
}

$json = json_decode($res['body'] ?? '', true);
if (!is_array($json) || ($json['ok'] ?? false) !== true) {
    fwrite(STDERR, "FAIL: unexpected health payload: " . ($res['body'] ?? '') . "\n");
    exit(1);
}

echo "OK proxy smoke /tim/health\n";
exit(0);
