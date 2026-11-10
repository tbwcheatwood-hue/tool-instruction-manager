<?php

require_once __DIR__ . '/../../php/Env.php';
require_once __DIR__ . '/../../php/TimTools.php';

$pass = 0;
$fail = 0;
$errors = [];

function ok($cond, $name) {
    global $pass, $fail, $errors;
    if ($cond) {
        $pass++;
    } else {
        $fail++;
        $errors[] = "FAIL: $name";
    }
}

$ws = sys_get_temp_dir() . '/tim-tools-' . getmypid();
@mkdir($ws, 0777, true);
putenv('TIM_WORKSPACE=' . $ws);
file_put_contents($ws . '/hello.txt', 'hi');

echo "TimTools tests\n";
echo str_repeat('-', 60) . "\n";

try {
    $list = TimTools::invoke('workspace_list', ['path' => '.']);
    ok(strpos($list, 'hello.txt') !== false, 'workspace_list finds file');
    $read = TimTools::invoke('workspace_read', ['path' => 'hello.txt']);
    ok($read === 'hi', 'workspace_read content');
    ok(TimTools::invoke('echo', ['message' => 'ping']) === 'ping', 'echo tool');
    $bad = false;
    try {
        TimTools::invoke('workspace_read', ['path' => '../etc/passwd']);
    } catch (Throwable $e) {
        $bad = true;
    }
    ok($bad, 'path traversal blocked');
    $bad2 = false;
    try {
        TimTools::invoke('nope', []);
    } catch (Throwable $e) {
        $bad2 = true;
    }
    ok($bad2, 'unknown tool rejected');
} catch (Throwable $e) {
    ok(false, 'unexpected: ' . $e->getMessage());
}

$regs = TimTools::registry();
ok(count($regs) >= 3, 'registry has tools');

echo str_repeat('-', 60) . "\n";
echo "$pass passed, $fail failed\n";
foreach ($errors as $e) {
    echo "  $e\n";
}
@unlink($ws . '/hello.txt');
@rmdir($ws);
exit($fail ? 1 : 0);
