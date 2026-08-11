<?php
declare(strict_types=1);

require_once __DIR__ . '/../../config/env.php';
require_once __DIR__ . '/../../core/http.php';
require_once __DIR__ . '/../../core/request.php';
require_once __DIR__ . '/../../core/router.php';

function bot_panel_proxy_is_local_origin(string $origin): bool
{
    if ($origin === '') return false;

    $parts = parse_url($origin);
    if (!is_array($parts)) return false;

    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));

    if (!in_array($scheme, ['http', 'https'], true)) return false;

    return $host === 'localhost'
        || str_ends_with($host, '.localhost')
        || $host === '127.0.0.1'
        || $host === '0.0.0.0'
        || $host === '::1';
}

function bot_panel_proxy_normalize_endpoint(string $endpoint): string
{
    $endpoint = trim($endpoint);
    $endpoint = trim($endpoint, "/\\ \t\n\r\0\x0B");

    if ($endpoint === '' || preg_match('/^[a-zA-Z0-9_-]+(?:\.php)?$/', $endpoint) !== 1) {
        api_error('Endpoint del Panel Bot no válido.', 'BOT_PROXY_ENDPOINT_INVALID', 422);
    }

    return preg_match('/\.php$/i', $endpoint) === 1 ? $endpoint : $endpoint . '.php';
}

function bot_panel_proxy_target_url(string $section, string $endpoint, array $params = []): string
{
    $folders = [
        'panel' => 'endpoints',
        'management' => 'puntos',
    ];

    if (!isset($folders[$section])) {
        api_error('Sección del Panel Bot no válida.', 'BOT_PROXY_SECTION_INVALID', 422);
    }

    $base = rtrim((string)env_value(
        'BOT_PANEL_REMOTE_URL',
        'https://lalcec.3devsnet.com/api/bot_whatsapp/funciones/Panel'
    ), '/');

    if (!preg_match('#^https://#i', $base)) {
        api_error('La URL remota del Panel Bot debe usar HTTPS.', 'BOT_PROXY_URL_INVALID', 500);
    }

    $url = $base . '/' . $folders[$section] . '/' . bot_panel_proxy_normalize_endpoint($endpoint);

    $query = [];
    foreach ($params as $key => $value) {
        if (!is_string($key) || preg_match('/^[a-zA-Z0-9_-]+$/', $key) !== 1) continue;
        if ($value === null || $value === '' || is_array($value) || is_object($value)) continue;
        $query[$key] = (string)$value;
    }

    return $query === [] ? $url : $url . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

function bot_panel_proxy_collect_multipart_payload(array $post, array $files): array
{
    $payload = [];

    foreach ($post as $key => $value) {
        if (str_starts_with((string)$key, '__bot_proxy_')) continue;
        if (is_array($value)) {
            foreach ($value as $index => $item) {
                if (is_scalar($item) || $item === null) {
                    $payload[$key . '[' . $index . ']'] = (string)$item;
                }
            }
            continue;
        }
        $payload[$key] = (string)$value;
    }

    foreach ($files as $key => $file) {
        if (!is_array($file) || !isset($file['tmp_name'])) continue;

        if (is_array($file['tmp_name'])) {
            foreach ($file['tmp_name'] as $index => $tmpName) {
                if (!is_string($tmpName) || $tmpName === '' || !is_uploaded_file($tmpName)) continue;
                $payload[$key . '[' . $index . ']'] = new CURLFile(
                    $tmpName,
                    (string)($file['type'][$index] ?? 'application/octet-stream'),
                    (string)($file['name'][$index] ?? 'archivo')
                );
            }
            continue;
        }

        $tmpName = (string)$file['tmp_name'];
        if ($tmpName === '' || !is_uploaded_file($tmpName)) continue;

        $payload[$key] = new CURLFile(
            $tmpName,
            (string)($file['type'] ?? 'application/octet-stream'),
            (string)($file['name'] ?? 'archivo')
        );
    }

    return $payload;
}

function bot_panel_proxy_multipart_stream_body(array $post, array $files): array
{
    $boundary = '----LalcecBotProxy' . bin2hex(random_bytes(12));
    $chunks = [];

    $appendField = static function (string $name, string $value) use (&$chunks, $boundary): void {
        $safeName = str_replace(["\r", "\n", '"'], '', $name);
        $chunks[] = '--' . $boundary . "\r\n"
            . 'Content-Disposition: form-data; name="' . $safeName . '"' . "\r\n\r\n"
            . $value . "\r\n";
    };

    foreach ($post as $key => $value) {
        if (str_starts_with((string)$key, '__bot_proxy_')) continue;
        if (is_array($value)) {
            foreach ($value as $index => $item) {
                if (is_scalar($item) || $item === null) {
                    $appendField((string)$key . '[' . $index . ']', (string)$item);
                }
            }
            continue;
        }
        $appendField((string)$key, (string)$value);
    }

    foreach ($files as $key => $file) {
        if (!is_array($file) || !isset($file['tmp_name'])) continue;

        $appendFile = static function (
            string $fieldName,
            string $tmpName,
            string $mime,
            string $originalName
        ) use (&$chunks, $boundary): void {
            if ($tmpName === '' || !is_uploaded_file($tmpName)) return;
            $contents = file_get_contents($tmpName);
            if ($contents === false) return;

            $safeField = str_replace(["\r", "\n", '"'], '', $fieldName);
            $safeName = str_replace(["\r", "\n", '"'], '', $originalName !== '' ? $originalName : 'archivo');
            $safeMime = preg_match('#^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$#', $mime) === 1
                ? $mime
                : 'application/octet-stream';

            $chunks[] = '--' . $boundary . "\r\n"
                . 'Content-Disposition: form-data; name="' . $safeField . '"; filename="' . $safeName . '"' . "\r\n"
                . 'Content-Type: ' . $safeMime . "\r\n\r\n"
                . $contents . "\r\n";
        };

        if (is_array($file['tmp_name'])) {
            foreach ($file['tmp_name'] as $index => $tmpName) {
                $appendFile(
                    (string)$key . '[' . $index . ']',
                    (string)$tmpName,
                    (string)($file['type'][$index] ?? 'application/octet-stream'),
                    (string)($file['name'][$index] ?? 'archivo')
                );
            }
            continue;
        }

        $appendFile(
            (string)$key,
            (string)$file['tmp_name'],
            (string)($file['type'] ?? 'application/octet-stream'),
            (string)($file['name'] ?? 'archivo')
        );
    }

    $chunks[] = '--' . $boundary . "--\r\n";
    return [implode('', $chunks), 'multipart/form-data; boundary=' . $boundary];
}

function bot_panel_proxy_status_from_headers(array $headers): int
{
    $status = 0;
    foreach ($headers as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$header, $match) === 1) {
            $status = (int)$match[1];
        }
    }
    return $status;
}


function bot_panel_proxy_execute(): never
{
    $appEnv = strtolower(trim((string)env_value('APP_ENV', 'production')));
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));

    // Este puente existe exclusivamente para desarrollo local. Aunque una
    // instalación de producción quedara accidentalmente con APP_ENV=local,
    // un origen de Hostinger no puede utilizarlo.
    if ($appEnv === 'production' || !bot_panel_proxy_is_local_origin($origin)) {
        api_error('El proxy del Panel Bot sólo está disponible en desarrollo local.', 'BOT_PROXY_LOCAL_ONLY', 403);
    }

    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    $isMultipart = str_contains($contentType, 'multipart/form-data');

    if ($isMultipart) {
        $section = trim((string)($_POST['__bot_proxy_section'] ?? ''));
        $endpoint = trim((string)($_POST['__bot_proxy_endpoint'] ?? ''));
        $remoteMethod = strtoupper(trim((string)($_POST['__bot_proxy_method'] ?? 'POST')));
        $paramsRaw = (string)($_POST['__bot_proxy_params'] ?? '{}');
        $paramsDecoded = json_decode($paramsRaw, true);
        $params = is_array($paramsDecoded) ? $paramsDecoded : [];
        $remoteBody = null;
    } else {
        $body = request_body();
        $section = trim((string)($body['section'] ?? ''));
        $endpoint = trim((string)($body['endpoint'] ?? ''));
        $remoteMethod = strtoupper(trim((string)($body['method'] ?? 'GET')));
        $params = is_array($body['params'] ?? null) ? $body['params'] : [];
        $remoteBody = $body['body'] ?? null;
    }

    if (!in_array($remoteMethod, ['GET', 'POST'], true)) {
        api_error('Método remoto no permitido.', 'BOT_PROXY_METHOD_INVALID', 405);
    }

    $targetUrl = bot_panel_proxy_target_url($section, $endpoint, $params);

    $localDevKey = trim((string)env_value('BOT_PANEL_LOCAL_DEV_KEY', ''));
    if ($localDevKey === '' || strlen($localDevKey) < 32) {
        api_error(
            'Falta configurar la clave local del Panel Bot.',
            'BOT_PROXY_LOCAL_KEY_MISSING',
            500
        );
    }

    $responseBody = false;
    $status = 0;
    $transportError = '';

    if (function_exists('curl_init')) {
        $ch = curl_init($targetUrl);
        if ($ch === false) {
            api_error('No se pudo iniciar la conexión con el Panel Bot.', 'BOT_PROXY_INIT_FAILED', 500);
        }

        $headers = [
            'Accept: application/json',
            'X-Panel-Local-Dev-Key: ' . $localDevKey,
        ];
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => $headers,
            
        ];

        if ($remoteMethod === 'POST') {
            $options[CURLOPT_POST] = true;
            if ($isMultipart) {
                $options[CURLOPT_POSTFIELDS] = bot_panel_proxy_collect_multipart_payload($_POST, $_FILES);
            } else {
                $headers[] = 'Content-Type: application/json';
                $options[CURLOPT_HTTPHEADER] = $headers;
                $options[CURLOPT_POSTFIELDS] = json_encode(
                    is_array($remoteBody) ? $remoteBody : [],
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                );
            }
        } else {
            $options[CURLOPT_HTTPGET] = true;
        }

        curl_setopt_array($ch, $options);
        $responseBody = curl_exec($ch);
        $transportError = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    } else {
        $headers = [
            'Accept: application/json',
            'X-Panel-Local-Dev-Key: ' . $localDevKey,
        ];
        $content = null;

        if ($remoteMethod === 'POST') {
            if ($isMultipart) {
                [$content, $multipartContentType] = bot_panel_proxy_multipart_stream_body($_POST, $_FILES);
                $headers[] = 'Content-Type: ' . $multipartContentType;
            } else {
                $headers[] = 'Content-Type: application/json';
                $content = json_encode(
                    is_array($remoteBody) ? $remoteBody : [],
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                );
            }
        }

        $contextOptions = [
            'http' => [
                'method' => $remoteMethod,
                'header' => implode("\r\n", $headers) . "\r\n",
                'ignore_errors' => true,
                'timeout' => 45,
            ],
        ];
        if ($content !== null) $contextOptions['http']['content'] = $content;

        $context = stream_context_create($contextOptions);
        $responseBody = @file_get_contents($targetUrl, false, $context);
        $responseHeaders = $http_response_header ?? [];
        $status = bot_panel_proxy_status_from_headers(is_array($responseHeaders) ? $responseHeaders : []);
        if ($responseBody === false) {
            $lastError = error_get_last();
            $transportError = is_array($lastError) ? (string)($lastError['message'] ?? '') : '';
        }
    }

    if ($responseBody === false) {
        api_error(
            'No se pudo conectar con el Panel Bot alojado en Hostinger.',
            'BOT_PROXY_REMOTE_UNREACHABLE',
            502,
            env_bool('APP_DEBUG', false) && $transportError !== '' ? ['transporte' => $transportError] : []
        );
    }


    $decoded = json_decode((string)$responseBody, true);
    if (!is_array($decoded)) {
        api_error('El Panel Bot remoto devolvió una respuesta no válida.', 'BOT_PROXY_INVALID_RESPONSE', 502);
    }

    $safeStatus = $status >= 100 && $status <= 599 ? $status : 200;
    json_response($decoded, $safeStatus);
}

function register_bot_panel_proxy_routes(Router $router): void
{
    // No usa require_auth(): el propio handler exige APP_ENV local y un Origin
    // localhost. Así también permite abrir /panel-bot local para diagnóstico.
    $router->register('bot_panel_proxy', 'POST', 'bot_panel_proxy_execute', false);
}
