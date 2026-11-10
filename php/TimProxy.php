<?php
/**
 * Forward HTTP to the loopback Node mesh engine.
 */
require_once __DIR__ . '/Env.php';

final class TimProxy
{
    public static function forward(string $method, string $backendPath, string $rawBody, array $incomingHeaders): array
    {
        $host = '127.0.0.1';
        $port = TimEnv::timEnginePort();
        $url = 'http://' . $host . ':' . $port . $backendPath;

        $headers = [];
        foreach ($incomingHeaders as $name => $value) {
            $lname = strtolower($name);
            if (in_array($lname, ['host', 'connection', 'content-length'], true)) {
                continue;
            }
            if (is_string($value)) {
                $headers[] = $name . ': ' . $value;
            }
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return ['code' => 502, 'headers' => [], 'body' => '{"error":"Proxy could not initialize curl"}'];
        }
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        if ($method !== 'GET' && $method !== 'HEAD' && $rawBody !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
        }
        if (count($headers) > 0) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);
            return [
                'code' => 502,
                'headers' => ['Content-Type: application/json'],
                'body' => json_encode(['error' => 'Mesh engine unreachable: ' . $err]),
            ];
        }
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        $headerBlock = substr($raw, 0, $headerSize);
        $body = substr($raw, $headerSize);
        $outHeaders = [];
        foreach (preg_split("/\r\n|\n|\r/", $headerBlock) as $line) {
            if (strpos($line, ':') === false) {
                continue;
            }
            [$hn, $hv] = explode(':', $line, 2);
            $hl = strtolower(trim($hn));
            if (in_array($hl, ['transfer-encoding', 'connection'], true)) {
                continue;
            }
            $outHeaders[] = trim($hn) . ': ' . trim($hv);
        }
        return ['code' => $code, 'headers' => $outHeaders, 'body' => $body];
    }
}
