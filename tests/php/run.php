<?php

$here = __DIR__;
$files = glob($here . DIRECTORY_SEPARATOR . '*.test.php');
sort($files);
$failed = [];
foreach ($files as $file) {
    $name = basename($file);
    echo "\n--- $name ---\n";
    passthru(PHP_BINARY . ' ' . escapeshellarg($file), $code);
    if ($code !== 0) {
        $failed[] = $name;
    }
}
echo "\n" . str_repeat('=', 60) . "\n";
if ($failed) {
    echo "Failed: " . implode(', ', $failed) . "\n";
    exit(1);
}
echo "All PHP tests passed.\n";
exit(0);
