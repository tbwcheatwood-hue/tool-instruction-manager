<?php

require_once __DIR__ . '/../../php/Router.php';

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

echo "Router tests\n";
echo str_repeat('-', 60) . "\n";

ok(TimRouter::classify('/api/version') === TimRouter::KIND_ALS_API, 'api classify');
ok(TimRouter::classify('/als-studio/index.html') === TimRouter::KIND_ALS_STUDIO, 'als studio classify');
ok(TimRouter::classify('/tim/tools') === TimRouter::KIND_TIM_TOOLS, 'tim tools classify');
ok(TimRouter::classify('/tim/health') === TimRouter::KIND_TIM_PROXY, 'tim proxy classify');
ok(TimRouter::classify('/') === TimRouter::KIND_STATIC, 'static classify');

ok(TimRouter::timBackendPath('/tim/health') === '/health', 'proxy path health');
ok(TimRouter::timBackendPath('/tim/flows') === '/flows', 'proxy path flows');

$fakeAls = sys_get_temp_dir() . '/tim-router-als-' . getmypid();
@mkdir($fakeAls . '/ui', 0777, true);
file_put_contents($fakeAls . '/index.html', '<html></html>');
$disk = TimRouter::alsStudioDiskPath('/als-studio/index.html', $fakeAls);
ok($disk !== null && is_file($disk), 'als studio maps to index.html');
ok(TimRouter::alsStudioDiskPath('/als-studio/storage/secret', $fakeAls) === null, 'blocks storage segment');

echo str_repeat('-', 60) . "\n";
echo "$pass passed, $fail failed\n";
foreach ($errors as $e) {
    echo "  $e\n";
}
@unlink($fakeAls . '/index.html');
@rmdir($fakeAls . '/ui');
@rmdir($fakeAls);
exit($fail ? 1 : 0);
