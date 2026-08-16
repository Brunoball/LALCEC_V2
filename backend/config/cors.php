<?php
declare(strict_types=1);
require_once __DIR__ . '/env.php';

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$isProduction = strtolower((string)env_value('APP_ENV', 'production')) === 'production';
$defaultOrigins = $isProduction ? '' : 'http://localhost:3000';
$allowed = array_values(array_filter(array_map('trim', explode(',', (string)env_value('ALLOWED_ORIGINS', $defaultOrigins)))));
$isLocalOrigin = preg_match('#^http://(localhost|127\.0\.0\.1):\d+$#', $origin) === 1;
$isLocalDev = !$isProduction && $isLocalOrigin;

// Desarrollo local contra Hostinger: permitir explícitamente el frontend React
// habitual sin abrir CORS a orígenes externos. Playwright conserva además su
// autorización especial para orígenes loopback locales.
$trustedLocalOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];
$isTrustedLocalFrontend = in_array($origin, $trustedLocalOrigins, true);

// El preflight no trae el valor del header E2E, pero sí declara su nombre.
$e2eHeader = strtoupper(trim((string)($_SERVER['HTTP_X_LALCEC_E2E'] ?? '')));
$requestedHeaders = strtolower((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''));
$isE2EActual = $isLocalOrigin && $e2eHeader === 'PLAYWRIGHT';
$isE2EPreflight = $isLocalOrigin && str_contains($requestedHeaders, 'x-lalcec-e2e');

$isAllowed = $origin !== '' && (
    $isLocalDev
    || $isTrustedLocalFrontend
    || in_array($origin, $allowed, true)
    || $isE2EActual
    || $isE2EPreflight
);

if (!headers_sent()) {
    if ($isAllowed) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    }
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Accept, Content-Type, Authorization, X-Session, X-Session-Key, X-CSRF-Token, X-Requested-With, X-LALCEC-E2E');
    header('Content-Type: application/json; charset=utf-8');
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
    http_response_code(204);
    exit;
}
